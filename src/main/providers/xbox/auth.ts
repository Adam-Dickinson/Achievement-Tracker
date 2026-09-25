import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { ProviderError, type ProviderErrorKind } from '@shared/errors'
import { Secret } from '@shared/secret'
import { xboxFetch, type XboxReply } from './api'
import { check } from './parse'

export const XBOX_CLIENT_ID = '081c236c-cad5-42b0-b842-3cdde7bad539'

const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const SCOPE = 'XboxLive.signin offline_access'
const USER_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const INVALID_GRANT = 'invalid_grant'

const XSTS_ERRORS: Readonly<Record<number, string>> = {
  2148916233:
    'this Microsoft account has no Xbox profile yet. Sign in to Xbox once, then try again',
  2148916235: 'Xbox Live is not available in this account’s country or region',
  2148916236: 'this account needs adult verification on the Xbox website',
  2148916237: 'this account needs adult verification on the Xbox website',
  2148916238: 'this is a child account. An adult has to add it to a Microsoft family first',
}

export interface MicrosoftTokens {
  readonly accessToken: Secret
  readonly refreshToken: Secret
  readonly expiresAt: Date
}

export interface XboxUserToken {
  readonly token: Secret
  readonly expiresAt: Date
}

export interface XboxSession {
  readonly authorization: Secret
  readonly xuid: string
  readonly gamertag: string
  readonly expiresAt: Date
}

export interface Pkce {
  readonly verifier: Secret
  readonly challenge: string
}

const microsoftTokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
})

const microsoftErrorSchema = z.object({ error: z.string().min(1) })

const userTokenSchema = z.object({
  Token: z.string().min(1),
  NotAfter: z.iso.datetime(),
})

const xboxUserClaimsSchema = z.object({
  uhs: z.string().min(1),
  xid: z.string().regex(/^\d+$/),
  gtg: z.string().min(1),
})

const xstsSchema = z.object({
  Token: z.string().min(1),
  NotAfter: z.iso.datetime(),
  DisplayClaims: z.object({
    xui: z.tuple([xboxUserClaimsSchema], xboxUserClaimsSchema),
  }),
})

const xstsErrorSchema = z.object({ XErr: z.number().int() })

export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url')
  return {
    verifier: new Secret(verifier),
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  }
}

export function authorizeUrl(redirectUri: string, challenge: string, state: string): string {
  const url = new URL(`${AUTHORITY}/authorize`)
  url.search = new URLSearchParams({
    client_id: XBOX_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
  }).toString()
  return url.toString()
}

export function exchangeCode(
  code: string,
  redirectUri: string,
  codeVerifier: Secret,
  signal?: AbortSignal,
): Promise<MicrosoftTokens> {
  return requestMicrosoftTokens(
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier.expose(),
    },
    'other',
    signal,
  )
}

export function refreshTokens(
  refreshToken: Secret,
  signal?: AbortSignal,
): Promise<MicrosoftTokens> {
  return requestMicrosoftTokens(
    { grant_type: 'refresh_token', refresh_token: refreshToken.expose() },
    'auth_expired',
    signal,
  )
}

export async function xboxUserToken(
  accessToken: Secret,
  signal?: AbortSignal,
): Promise<XboxUserToken> {
  const reply = await postXbox(
    USER_AUTH_URL,
    {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${accessToken.expose()}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    },
    signal,
  )
  if (reply.status === 400 || reply.status === 401) {
    throw new ProviderError('auth_expired', 'Xbox: Xbox Live did not accept the Microsoft sign-in')
  }
  if (!reply.ok) throw unexpected('user.auth.xboxlive.com', reply)
  const body = check(userTokenSchema, reply.body, 'Xbox user token')
  return { token: new Secret(body.Token), expiresAt: new Date(body.NotAfter) }
}

export async function xstsSession(userToken: Secret, signal?: AbortSignal): Promise<XboxSession> {
  const reply = await postXbox(
    XSTS_URL,
    {
      Properties: { SandboxId: 'RETAIL', UserTokens: [userToken.expose()] },
      RelyingParty: 'http://xboxlive.com',
      TokenType: 'JWT',
    },
    signal,
  )
  if (!reply.ok) throw xstsError(reply)
  const body = check(xstsSchema, reply.body, 'XSTS token')
  const [claims] = body.DisplayClaims.xui
  return {
    authorization: new Secret(`XBL3.0 x=${claims.uhs};${body.Token}`),
    xuid: claims.xid,
    gamertag: claims.gtg,
    expiresAt: new Date(body.NotAfter),
  }
}

async function requestMicrosoftTokens(
  params: Readonly<Record<string, string>>,
  invalidGrantKind: ProviderErrorKind,
  signal?: AbortSignal,
): Promise<MicrosoftTokens> {
  const reply = await xboxFetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: XBOX_CLIENT_ID, scope: SCOPE, ...params }),
    signal,
  })
  if (!reply.ok) throw microsoftError(reply, invalidGrantKind)
  const tokens = check(microsoftTokenSchema, reply.body, 'Microsoft token')
  return {
    accessToken: new Secret(tokens.access_token),
    refreshToken: new Secret(tokens.refresh_token),
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  }
}

function postXbox(url: string, body: unknown, signal?: AbortSignal): Promise<XboxReply> {
  return xboxFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-xbl-contract-version': '1',
    },
    body: JSON.stringify(body),
    signal,
  })
}

function microsoftError(reply: XboxReply, invalidGrantKind: ProviderErrorKind): ProviderError {
  const parsed = microsoftErrorSchema.safeParse(reply.body)
  if (!parsed.success) return unexpected('login.microsoftonline.com', reply)
  if (parsed.data.error === INVALID_GRANT) {
    return new ProviderError(invalidGrantKind, 'Xbox: the Microsoft sign-in has expired')
  }
  return new ProviderError('other', `Xbox: Microsoft refused the sign-in (${parsed.data.error})`)
}

function xstsError(reply: XboxReply): ProviderError {
  const parsed = xstsErrorSchema.safeParse(reply.body)
  if (parsed.success) {
    const reason = XSTS_ERRORS[parsed.data.XErr] ?? `sign-in refused (XErr ${parsed.data.XErr})`
    return new ProviderError('other', `Xbox: ${reason}`)
  }
  if (reply.status === 401) {
    return new ProviderError('auth_expired', 'Xbox: Xbox Live did not accept the user token')
  }
  return unexpected('xsts.auth.xboxlive.com', reply)
}

function unexpected(host: string, reply: XboxReply): ProviderError {
  return new ProviderError('other', `Xbox: unexpected reply from ${host} (HTTP ${reply.status})`)
}
