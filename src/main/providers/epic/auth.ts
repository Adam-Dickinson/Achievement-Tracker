import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { epicFetch } from './api'
import { check } from './parse'

export const EPIC_CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a'

const EPIC_CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf'
const TOKEN_URL = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token'
const CODE = /^[0-9a-f]{32}$/i
const CODE_IN_PAGE = /"authorizationCode"\s*:\s*"([0-9a-f]{32})"/i
const CODE_NOT_FOUND = 'errors.com.epicgames.account.oauth.authorization_code_not_found'

export const EPIC_SIGN_IN_URL = `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(
  `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT_ID}&responseType=code`,
)}`

export interface EpicSession {
  readonly authorization: Secret
  readonly refreshToken: Secret
  readonly accountId: string
  readonly displayName: string | null
  readonly expiresAt: Date
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  account_id: z.string().regex(/^[0-9a-f]{32}$/i),
  displayName: z.string().nullish(),
})

const errorSchema = z.object({ errorCode: z.string().min(1) })

export function readAuthorizationCode(pasted: string): string | null {
  const text = pasted.trim()
  if (CODE.test(text)) return text.toLowerCase()
  return CODE_IN_PAGE.exec(text)?.[1]?.toLowerCase() ?? null
}

export function exchangeCode(code: Secret, now: Date, signal?: AbortSignal): Promise<EpicSession> {
  return requestSession({ grant_type: 'authorization_code', code: code.expose() }, now, signal)
}

export function refreshSession(
  refreshToken: Secret,
  now: Date,
  signal?: AbortSignal,
): Promise<EpicSession> {
  return requestSession(
    { grant_type: 'refresh_token', refresh_token: refreshToken.expose() },
    now,
    signal,
  )
}

async function requestSession(
  params: Readonly<Record<string, string>>,
  now: Date,
  signal?: AbortSignal,
): Promise<EpicSession> {
  const client = Buffer.from(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`).toString('base64')
  const reply = await epicFetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `basic ${client}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ ...params, token_type: 'eg1' }),
    signal,
  })
  if (!reply.ok) throw tokenError(reply.status, reply.body)

  const tokens = check(tokenSchema, reply.body, 'sign-in')
  return {
    authorization: new Secret(`${tokens.token_type} ${tokens.access_token}`),
    refreshToken: new Secret(tokens.refresh_token),
    accountId: tokens.account_id.toLowerCase(),
    displayName: tokens.displayName?.trim() || null,
    expiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
  }
}

function tokenError(status: number, body: unknown): ProviderError {
  const parsed = errorSchema.safeParse(body)
  if (status === 400 && parsed.success) {
    const message =
      parsed.data.errorCode === CODE_NOT_FOUND
        ? 'Epic: that sign-in code has expired or was already used'
        : 'Epic: the sign-in has expired'
    return new ProviderError('auth_expired', message)
  }
  return new ProviderError('other', `Epic: unexpected reply from the sign-in (HTTP ${status})`)
}
