import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { eaFetch } from './api'
import { check } from './parse'

const TOKEN_URL =
  'https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none'
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const COOKIE_NAMES = ['sid', 'remid', '_nx_mpcid'] as const

type CookieName = (typeof COOKIE_NAMES)[number]
type EaCookies = Partial<Record<CookieName, string>>

export interface BrowserCookie {
  readonly name: string
  readonly value: string
}

export interface EaToken {
  readonly token: Secret
  readonly cookies: Secret
  readonly expiresAt: Date
}

const cookiesSchema = z
  .object({
    sid: z.string().min(1).optional(),
    remid: z.string().min(1).optional(),
    _nx_mpcid: z.string().min(1).optional(),
  })
  .refine((cookies) => cookies.sid !== undefined || cookies.remid !== undefined)

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z
    .union([z.number(), z.string().regex(/^\d+$/)])
    .transform(Number)
    .pipe(z.number().int().positive()),
})

const refusalSchema = z.object({ error: z.string().min(1) })

export function readSignInCookies(cookies: readonly BrowserCookie[]): Secret | null {
  const kept: EaCookies = {}
  for (const cookie of cookies) {
    if (isCookieName(cookie.name) && cookie.value !== '') kept[cookie.name] = cookie.value
  }
  return kept.sid ? toSecret(kept) : null
}

export async function requestToken(
  cookies: Secret,
  now: Date,
  signal?: AbortSignal,
): Promise<EaToken> {
  const stored = readCookies(cookies)
  const reply = await eaFetch(TOKEN_URL, {
    headers: {
      Accept: 'application/json',
      Cookie: cookieHeader(stored),
      'User-Agent': BROWSER_USER_AGENT,
    },
    signal,
  })
  if (refusalSchema.safeParse(reply.body).success && !tokenSchema.safeParse(reply.body).success) {
    throw new ProviderError('auth_expired', 'EA: the sign-in has expired')
  }
  if (!reply.ok) {
    throw new ProviderError('other', `EA: unexpected reply from the sign-in (HTTP ${reply.status})`)
  }
  const token = check(tokenSchema, reply.body, 'token')
  return {
    token: new Secret(token.access_token),
    cookies: toSecret(applySetCookies(stored, reply.setCookies, now)),
    expiresAt: new Date(now.getTime() + token.expires_in * 1000),
  }
}

function applySetCookies(stored: EaCookies, setCookies: readonly string[], now: Date): EaCookies {
  const next = { ...stored }
  for (const line of setCookies) {
    const [pair = '', ...attributes] = line.split(';')
    const split = pair.indexOf('=')
    const name = pair.slice(0, split).trim()
    const value = pair.slice(split + 1).trim()
    if (split < 0 || !isCookieName(name) || value === '' || isDeletion(attributes, now)) continue
    next[name] = value
  }
  return next
}

function isDeletion(attributes: readonly string[], now: Date): boolean {
  return attributes.some((attribute) => {
    const [key = '', value = ''] = attribute.trim().split('=')
    const name = key.toLowerCase()
    if (name === 'max-age') return Number(value) <= 0
    if (name === 'expires') return Date.parse(value) <= now.getTime()
    return false
  })
}

function readCookies(secret: Secret): EaCookies {
  let json: unknown
  try {
    json = JSON.parse(secret.expose())
  } catch {
    json = null
  }
  const cookies = cookiesSchema.safeParse(json)
  if (!cookies.success) {
    throw new ProviderError('auth_expired', 'EA: the stored sign-in is not usable')
  }
  return cookies.data
}

function cookieHeader(cookies: EaCookies): string {
  return COOKIE_NAMES.flatMap((name) => {
    const value = cookies[name]
    return value ? [`${name}=${value}`] : []
  }).join('; ')
}

function toSecret(cookies: EaCookies): Secret {
  return new Secret(JSON.stringify(cookies))
}

function isCookieName(name: string): name is CookieName {
  return (COOKIE_NAMES as readonly string[]).includes(name)
}
