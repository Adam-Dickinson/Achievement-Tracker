import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type { RemoteGame } from '@shared/models'
import { Secret } from '@shared/secret'
import type { BrowserCookie } from '../browser-cookie'
import { retryAfterMs } from '../http'
import { steamGet } from './api'
import { check, STEAM_APP_IMAGES, STEAM_STORE_ART } from './parse'

const REFRESH_URL = 'https://login.steampowered.com/jwt/ajaxrefresh'
const SET_TOKEN_URL = 'https://store.steampowered.com/login/settoken'
const STORE_ORIGIN = 'https://store.steampowered.com'
const REFRESH_COOKIE = 'steamRefresh_steam'
const SESSION_COOKIE = 'steamLoginSecure'
const FAMILY_GROUP = '/IFamilyGroupsService/GetFamilyGroupForUser/v1/'
const SHARED_LIBRARY = '/IFamilyGroupsService/GetSharedLibraryApps/v1/'
const STORE_ITEMS = '/IStoreBrowseService/GetItems/v1/'
const STEAM_ACHIEVEMENTS_CATEGORY = 22
const STORE_BATCH = 50
const STORE_FOUND = 1
const SHAREABLE = 0
const RECENT_MS = 14 * 24 * 60 * 60 * 1000
const STEAM_ID64 = /^7656119\d{10}$/

export interface FamilyToken {
  readonly token: Secret
  readonly expiresAt: Date
}

export interface FamilyApp {
  readonly appid: string
  readonly name: string
  readonly iconHash: string | null
  readonly lastPlayed: Date | null
}

const storedSchema = z.object({ key: z.string().min(1), family: z.string().min(1).optional() })

const ticketSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    login_url: z.string(),
    steamID: z.string(),
    nonce: z.string(),
    redir: z.string(),
    auth: z.string(),
  }),
  z.object({ success: z.literal(false), error: z.number().optional() }),
])

const claimsSchema = z.object({ exp: z.number().int().positive() })

const groupSchema = z.object({
  response: z.object({
    family_groupid: z.string().regex(/^\d+$/).optional(),
    is_not_member_of_any_group: z.boolean().optional(),
  }),
})

const sharedSchema = z.object({
  response: z.object({
    apps: z
      .array(
        z.object({
          appid: z.number().int().positive(),
          name: z.string(),
          img_icon_hash: z.string().optional(),
          exclude_reason: z.number().int().optional(),
          rt_last_played: z.number().int().min(0).optional(),
          owner_steamids: z.array(z.string()),
        }),
      )
      .optional(),
  }),
})

const storeItemsSchema = z.object({
  response: z.object({
    store_items: z
      .array(
        z.object({
          id: z.number().int(),
          success: z.number().int(),
          categories: z
            .object({ feature_categoryids: z.array(z.number().int()).optional() })
            .optional(),
        }),
      )
      .optional(),
  }),
})

export function readSteamSecret(secret: Secret): { key: Secret; family: Secret | null } {
  const raw = secret.expose()
  if (!raw.startsWith('{')) return { key: secret, family: null }
  const stored = storedSchema.safeParse(parseJson(raw))
  if (!stored.success) {
    throw new ProviderError('auth_expired', 'Steam: the stored sign-in is not usable')
  }
  return {
    key: new Secret(stored.data.key),
    family: stored.data.family ? new Secret(stored.data.family) : null,
  }
}

export function withFamily(secret: Secret, family: Secret): Secret {
  const { key } = readSteamSecret(secret)
  return new Secret(JSON.stringify({ key: key.expose(), family: family.expose() }))
}

export function readFamilySignIn(cookies: readonly BrowserCookie[]): Secret | null {
  const refresh = cookies.find((cookie) => cookie.name === REFRESH_COOKIE && cookie.value !== '')
  return refresh && familySteamId(new Secret(refresh.value)) ? new Secret(refresh.value) : null
}

export function familySteamId(refresh: Secret): string | null {
  const [steamId = ''] = safeDecode(refresh.expose()).split('||')
  return STEAM_ID64.test(steamId) ? steamId : null
}

export async function requestFamilyToken(
  refresh: Secret,
  signal?: AbortSignal,
): Promise<FamilyToken> {
  const ticketReply = await storePost(
    REFRESH_URL,
    { redir: `${STORE_ORIGIN}/` },
    { Cookie: `${REFRESH_COOKIE}=${refresh.expose()}` },
    signal,
  )
  const ticket = check(ticketSchema, parseJson(ticketReply.text), 'refresh')
  if (!ticket.success) {
    throw new ProviderError(
      'auth_expired',
      'Steam: the Steam sign-in for the family library has expired',
    )
  }
  if (ticket.login_url !== SET_TOKEN_URL) {
    throw new ProviderError('parse', 'Steam: the sign-in pointed somewhere unexpected')
  }

  const tokenReply = await storePost(
    SET_TOKEN_URL,
    { steamID: ticket.steamID, nonce: ticket.nonce, redir: ticket.redir, auth: ticket.auth },
    {},
    signal,
  )
  const token = sessionToken(tokenReply.setCookies)
  if (token === null) {
    throw new ProviderError(
      'auth_expired',
      'Steam: the Steam sign-in for the family library has expired',
    )
  }
  return { token: new Secret(token), expiresAt: new Date(expiryOf(token) * 1000) }
}

export async function fetchFamilyApps(
  token: Secret,
  steamId: string,
  signal?: AbortSignal,
): Promise<readonly FamilyApp[]> {
  const group = check(
    groupSchema,
    await familyGet(FAMILY_GROUP, { steamid: steamId }, token, signal),
    'family group',
  ).response
  if (!group.family_groupid) return []

  const shared = check(
    sharedSchema,
    await familyGet(
      SHARED_LIBRARY,
      {
        family_groupid: group.family_groupid,
        steamid: steamId,
        include_own: 'true',
        include_excluded: 'true',
        include_free: 'true',
        include_non_games: 'false',
      },
      token,
      signal,
    ),
    'family library',
  ).response
  return (shared.apps ?? [])
    .filter((app) => !app.owner_steamids.includes(steamId))
    .filter((app) => (app.exclude_reason ?? SHAREABLE) === SHAREABLE)
    .map((app) => ({
      appid: String(app.appid),
      name: app.name.trim() || String(app.appid),
      iconHash: app.img_icon_hash?.trim() || null,
      lastPlayed: app.rt_last_played ? new Date(app.rt_last_played * 1000) : null,
    }))
}

export async function fetchStoreAchievementFlags(
  appids: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, boolean | null>> {
  const flags = new Map<string, boolean | null>(appids.map((appid) => [appid, null]))
  for (let start = 0; start < appids.length; start += STORE_BATCH) {
    const batch = appids.slice(start, start + STORE_BATCH)
    const input = {
      ids: batch.map((appid) => ({ appid: Number(appid) })),
      context: { language: 'english', country_code: 'US' },
      data_request: { include_basic_info: true },
    }
    const items = check(
      storeItemsSchema,
      await steamGet(STORE_ITEMS, { input_json: JSON.stringify(input) }, { signal }),
      'store items',
    ).response.store_items
    for (const item of items ?? []) {
      const appid = String(item.id)
      if (item.success !== STORE_FOUND || !flags.has(appid)) continue
      const features = item.categories?.feature_categoryids ?? []
      flags.set(appid, features.includes(STEAM_ACHIEVEMENTS_CATEGORY))
    }
  }
  return flags
}

export function toFamilyGame(app: FamilyApp, now: Date): RemoteGame {
  return {
    ref: { externalId: app.appid },
    title: app.name,
    iconUrl: app.iconHash ? `${STEAM_APP_IMAGES}/${app.appid}/${app.iconHash}.jpg` : null,
    coverUrl: `${STEAM_STORE_ART}/${app.appid}/header.jpg`,
    lastPlayed: app.lastPlayed,
    recentlyPlayed:
      app.lastPlayed !== null && now.getTime() - app.lastPlayed.getTime() <= RECENT_MS,
  }
}

async function familyGet(
  path: string,
  params: Readonly<Record<string, string>>,
  token: Secret,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await steamGet(path, { ...params, access_token: token.expose() }, { signal })
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'auth_expired') {
      throw new ProviderError('auth_expired', 'Steam: the family library session was rejected', {
        cause: error,
      })
    }
    throw error
  }
}

interface StoreReply {
  readonly text: string
  readonly setCookies: readonly string[]
}

async function storePost(
  url: string,
  form: Readonly<Record<string, string>>,
  headers: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<StoreReply> {
  const host = new URL(url).host
  let response: Response
  let text: string
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: STORE_ORIGIN,
        Referer: `${STORE_ORIGIN}/`,
        ...headers,
      },
      body: new URLSearchParams(form).toString(),
      signal,
    })
    text = await response.text()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ProviderError('network', `Steam: could not reach ${host}`, { cause: error })
  }
  if (response.status === 429) {
    throw new ProviderError('rate_limited', `Steam: too many requests to ${host}`, {
      retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
    })
  }
  if (response.status >= 500) {
    throw new ProviderError('network', `Steam: server error from ${host} (HTTP ${response.status})`)
  }
  if (!response.ok) {
    throw new ProviderError('other', `Steam: ${host} refused the sign-in (HTTP ${response.status})`)
  }
  return { text, setCookies: response.headers.getSetCookie() }
}

function sessionToken(setCookies: readonly string[]): string | null {
  for (const line of setCookies) {
    const [pair = ''] = line.split(';')
    const split = pair.indexOf('=')
    if (pair.slice(0, split).trim() !== SESSION_COOKIE) continue
    const [, token = ''] = safeDecode(pair.slice(split + 1).trim()).split('||')
    if (token !== '') return token
  }
  return null
}

function expiryOf(token: string): number {
  const [, payload = ''] = token.split('.')
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    json = null
  }
  return check(claimsSchema, json, 'session token').exp
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
