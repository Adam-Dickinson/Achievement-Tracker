import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import type { BrowserCookie } from '../browser-cookie'
import { psnFetch } from './api'
import { check } from './parse'

const AUTHZ_URL = 'https://ca.account.sony.com/api/authz/v3/oauth'
const CLIENT_ID = '09515159-7237-4370-9b40-3806e67c0891'
const CLIENT_SECRET = 'ucPjka5tntB2KqsP'
const SCOPE = 'psn:mobile.v2.core psn:clientapp'
const NPSSO = 'npsso'

export const PSN_REDIRECT_URI = 'com.scee.psxandroid.scecompcall://redirect'

export const PSN_SIGN_IN_URL = `${AUTHZ_URL}/authorize?${new URLSearchParams({
  access_type: 'offline',
  client_id: CLIENT_ID,
  redirect_uri: PSN_REDIRECT_URI,
  response_type: 'code',
  scope: SCOPE,
}).toString()}`

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  refresh_token_expires_in: z.number().int().positive(),
})

const refusalSchema = z.object({ error: z.string().min(1) })

export interface PsnTokens {
  readonly accessToken: Secret
  readonly accessExpiresAt: Date
  readonly refreshToken: Secret
  readonly refreshExpiresAt: Date
}

export function isPsnRedirect(url: string): boolean {
  return url.startsWith(`${PSN_REDIRECT_URI}/`) || url.startsWith(`${PSN_REDIRECT_URI}?`)
}

export function readNpsso(cookies: readonly BrowserCookie[]): Secret | null {
  const npsso = cookies.find((cookie) => cookie.name === NPSSO && cookie.value !== '')
  return npsso ? new Secret(npsso.value) : null
}

export async function mintTokens(
  npsso: Secret,
  now: Date,
  signal?: AbortSignal,
): Promise<PsnTokens> {
  const code = await requestCode(npsso, signal)
  return requestTokens(
    { code, redirect_uri: PSN_REDIRECT_URI, grant_type: 'authorization_code' },
    now,
    signal,
  )
}

export function renewTokens(
  refreshToken: Secret,
  now: Date,
  signal?: AbortSignal,
): Promise<PsnTokens> {
  return requestTokens(
    { refresh_token: refreshToken.expose(), grant_type: 'refresh_token', scope: SCOPE },
    now,
    signal,
  )
}

async function requestCode(npsso: Secret, signal?: AbortSignal): Promise<string> {
  const reply = await psnFetch(PSN_SIGN_IN_URL, {
    headers: { Cookie: `${NPSSO}=${npsso.expose()}` },
    redirect: 'manual',
    signal,
  })
  const location = reply.location ?? ''
  if (reply.status >= 300 && reply.status < 400 && !isPsnRedirect(location)) {
    throw new ProviderError('auth_expired', 'PlayStation: the sign-in has expired')
  }
  const code = isPsnRedirect(location) ? new URL(location).searchParams.get('code') : null
  if (code) return code
  if (isPsnRedirect(location)) {
    throw new ProviderError('auth_expired', 'PlayStation: Sony refused the sign-in')
  }
  throw new ProviderError(
    'other',
    `PlayStation: unexpected reply from the sign-in (HTTP ${reply.status})`,
  )
}

async function requestTokens(
  form: Readonly<Record<string, string>>,
  now: Date,
  signal?: AbortSignal,
): Promise<PsnTokens> {
  const reply = await psnFetch(`${AUTHZ_URL}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ ...form, token_format: 'jwt' }),
    signal,
  })
  if (!reply.ok && refusalSchema.safeParse(reply.body).success) {
    throw new ProviderError('auth_expired', 'PlayStation: Sony refused the token request')
  }
  if (!reply.ok) {
    throw new ProviderError(
      'other',
      `PlayStation: unexpected reply from the sign-in (HTTP ${reply.status})`,
    )
  }
  const token = check(tokenSchema, reply.body, 'token')
  return {
    accessToken: new Secret(token.access_token),
    accessExpiresAt: new Date(now.getTime() + token.expires_in * 1000),
    refreshToken: new Secret(token.refresh_token),
    refreshExpiresAt: new Date(now.getTime() + token.refresh_token_expires_in * 1000),
  }
}
