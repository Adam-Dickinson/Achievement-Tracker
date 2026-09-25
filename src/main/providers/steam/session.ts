import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import type { BrowserCookie } from '../browser-cookie'
import { retryAfterMs } from '../http'
import { check } from './parse'

const REFRESH_URL = 'https://login.steampowered.com/jwt/ajaxrefresh'
const API_KEY_PAGE = 'https://steamcommunity.com/dev/apikey'
const API_KEY_ON_PAGE = /Key:\s*([0-9A-F]{32})\b/i
const REFRESH_COOKIE = 'steamRefresh_steam'
const SESSION_COOKIE = 'steamLoginSecure'
const STEAM_ID64 = /^7656119\d{10}$/

export type SteamSite = 'store' | 'community'

const SITE_ORIGINS: Record<SteamSite, string> = {
  store: 'https://store.steampowered.com',
  community: 'https://steamcommunity.com',
}

export interface SteamSession {
  readonly token: Secret
  readonly cookie: Secret
  readonly expiresAt: Date
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

export function readSteamSignIn(cookies: readonly BrowserCookie[]): Secret | null {
  const refresh = cookies.find((cookie) => cookie.name === REFRESH_COOKIE && cookie.value !== '')
  return refresh && signInSteamId(new Secret(refresh.value)) ? new Secret(refresh.value) : null
}

export function signInSteamId(refresh: Secret): string | null {
  const [steamId = ''] = safeDecode(refresh.expose()).split('||')
  return STEAM_ID64.test(steamId) ? steamId : null
}

export async function requestSteamSession(
  refresh: Secret,
  site: SteamSite,
  signal?: AbortSignal,
): Promise<SteamSession> {
  const origin = SITE_ORIGINS[site]
  const setTokenUrl = `${origin}/login/settoken`
  const ticketReply = await sitePost(
    REFRESH_URL,
    origin,
    { redir: `${origin}/` },
    { Cookie: `${REFRESH_COOKIE}=${refresh.expose()}` },
    signal,
  )
  const ticket = check(ticketSchema, parseJson(ticketReply.text), 'refresh')
  if (!ticket.success) throw signInExpired()
  if (ticket.login_url !== setTokenUrl) {
    throw new ProviderError('parse', 'Steam: the sign-in pointed somewhere unexpected')
  }

  const tokenReply = await sitePost(
    setTokenUrl,
    origin,
    { steamID: ticket.steamID, nonce: ticket.nonce, redir: ticket.redir, auth: ticket.auth },
    {},
    signal,
  )
  const cookie = sessionCookie(tokenReply.setCookies)
  if (cookie === null) throw signInExpired()
  return {
    token: new Secret(cookie.token),
    cookie: new Secret(cookie.value),
    expiresAt: new Date(expiryOf(cookie.token) * 1000),
  }
}

export async function readApiKey(refresh: Secret, signal?: AbortSignal): Promise<Secret | null> {
  const session = await requestSteamSession(refresh, 'community', signal)
  let response: Response
  let html: string
  try {
    response = await fetch(API_KEY_PAGE, {
      headers: { Cookie: `${SESSION_COOKIE}=${session.cookie.expose()}` },
      redirect: 'manual',
      signal,
    })
    html = await response.text()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ProviderError('network', 'Steam: could not reach steamcommunity.com', {
      cause: error,
    })
  }
  if (response.status >= 300 && response.status < 400) throw signInExpired()
  if (!response.ok) {
    throw new ProviderError(
      'other',
      `Steam: unexpected reply from the API key page (HTTP ${response.status})`,
    )
  }
  const key = API_KEY_ON_PAGE.exec(html)?.[1]
  return key ? new Secret(key.toUpperCase()) : null
}

function signInExpired(): ProviderError {
  return new ProviderError('auth_expired', 'Steam: the Steam sign-in has expired')
}

interface SiteReply {
  readonly text: string
  readonly setCookies: readonly string[]
}

async function sitePost(
  url: string,
  origin: string,
  form: Readonly<Record<string, string>>,
  headers: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<SiteReply> {
  const host = new URL(url).host
  let response: Response
  let text: string
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: origin,
        Referer: `${origin}/`,
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

function sessionCookie(setCookies: readonly string[]): { value: string; token: string } | null {
  for (const line of setCookies) {
    const [pair = ''] = line.split(';')
    const split = pair.indexOf('=')
    if (pair.slice(0, split).trim() !== SESSION_COOKIE) continue
    const value = pair.slice(split + 1).trim()
    const [, token = ''] = safeDecode(value).split('||')
    if (token !== '') return { value, token }
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

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
