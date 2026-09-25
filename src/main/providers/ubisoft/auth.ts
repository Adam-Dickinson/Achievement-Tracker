import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { UBISOFT_LAUNCHER_APP_ID, ubisoftFetch } from './api'
import { check } from './parse'

const SESSIONS_URL = 'https://public-ubiservices.ubi.com/v3/profiles/sessions'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface UbisoftSession {
  readonly ticket: Secret
  readonly sessionId: string
  readonly rememberMeTicket: Secret
  readonly userId: string
  readonly displayName: string | null
  readonly expiresAt: Date
}

const sessionSchema = z.object({
  ticket: z.string().min(1),
  sessionId: z.string().min(1),
  rememberMeTicket: z.string().min(1),
  userId: z.string().regex(UUID),
  nameOnPlatform: z.string().nullish(),
  expiration: z.iso.datetime({ offset: true }),
  serverTime: z.iso.datetime({ offset: true }),
})

const signInReplySchema = z.object({
  ticket: z.string().min(1),
  rememberMeTicket: z.string().min(1),
})

const errorSchema = z.object({ errorCode: z.number().int() })

export function readSignInReply(json: unknown): Secret | null {
  const reply = signInReplySchema.safeParse(json)
  return reply.success ? new Secret(reply.data.rememberMeTicket) : null
}

export async function refreshSession(
  rememberMeTicket: Secret,
  now: Date,
  signal?: AbortSignal,
): Promise<UbisoftSession> {
  const reply = await ubisoftFetch(SESSIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Ubi-AppId': UBISOFT_LAUNCHER_APP_ID,
      Authorization: `rm_v1 t=${rememberMeTicket.expose()}`,
    },
    body: JSON.stringify({ rememberMe: true }),
    signal,
  })
  if (!reply.ok) throw sessionError(reply.status, reply.body)

  const session = check(sessionSchema, reply.body, 'sign-in')
  const lifetimeMs = Date.parse(session.expiration) - Date.parse(session.serverTime)
  return {
    ticket: new Secret(session.ticket),
    sessionId: session.sessionId,
    rememberMeTicket: new Secret(session.rememberMeTicket),
    userId: session.userId.toLowerCase(),
    displayName: session.nameOnPlatform?.trim() || null,
    expiresAt: new Date(now.getTime() + lifetimeMs),
  }
}

function sessionError(status: number, body: unknown): ProviderError {
  if ((status === 401 || status === 403) && errorSchema.safeParse(body).success) {
    return new ProviderError('auth_expired', 'Ubisoft: the sign-in has expired')
  }
  return new ProviderError('other', `Ubisoft: unexpected reply from the sign-in (HTTP ${status})`)
}
