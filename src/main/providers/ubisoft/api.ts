import { ProviderError } from '@shared/errors'
import type { Secret } from '@shared/secret'
import { retryAfterMs } from '../http'

export const UBISOFT_LAUNCHER_APP_ID = 'f68a4bb5-608a-4ff2-8123-be8ef797e0a6'

const GRAPHQL_URL = 'https://public-ubiservices.ubi.com/v1/profiles/me/uplay/graphql'
const LOCALE = 'en-US'
const REJECTED_TICKET_CODES = new Set(['INVALID_TICKET', 'UNAUTHENTICATED'])

export interface UbisoftReply {
  readonly ok: boolean
  readonly status: number
  readonly body: unknown
}

export interface UbisoftFetchInit {
  readonly method?: 'GET' | 'POST'
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  readonly signal?: AbortSignal
}

export interface UbisoftTicket {
  readonly ticket: Secret
  readonly sessionId: string
}

export async function ubisoftGraphql(
  query: string,
  variables: Readonly<Record<string, string>>,
  auth: UbisoftTicket,
  signal?: AbortSignal,
): Promise<unknown> {
  const reply = await ubisoftFetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Ubi-AppId': UBISOFT_LAUNCHER_APP_ID,
      'Ubi-SessionId': auth.sessionId,
      'Ubi-LocaleCode': LOCALE,
      Authorization: `Ubi_v1 t=${auth.ticket.expose()}`,
    },
    body: JSON.stringify({ query, variables }),
    signal,
  })
  const errors = graphqlErrors(reply.body)
  if (reply.status === 401 || errors.some((e) => e.code && REJECTED_TICKET_CODES.has(e.code))) {
    throw new ProviderError('auth_expired', 'Ubisoft: Ubisoft Connect rejected the session')
  }
  const [first] = errors
  if (first) {
    throw new ProviderError('other', `Ubisoft: Ubisoft Connect refused a query (${first.message})`)
  }
  if (!reply.ok) {
    throw new ProviderError(
      'other',
      `Ubisoft: unexpected reply from Ubisoft Connect (HTTP ${reply.status})`,
    )
  }
  if (typeof reply.body !== 'object' || reply.body === null || !('data' in reply.body)) {
    throw new ProviderError('parse', 'Ubisoft: Ubisoft Connect replied without data')
  }
  return reply.body.data
}

export async function ubisoftFetch(url: string, init: UbisoftFetchInit): Promise<UbisoftReply> {
  const host = new URL(url).host
  let response: Response
  let text: string
  try {
    response = await fetch(url, init)
    text = await response.text()
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new ProviderError('network', `Ubisoft: could not reach ${host}`, { cause: error })
  }

  if (response.status === 429) {
    throw new ProviderError('rate_limited', `Ubisoft: too many requests to ${host}`, {
      retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
    })
  }
  if (response.status >= 500) {
    throw new ProviderError(
      'network',
      `Ubisoft: server error from ${host} (HTTP ${response.status})`,
    )
  }
  return { ok: response.ok, status: response.status, body: readBody(text, response.ok, host) }
}

interface GraphqlError {
  readonly message: string
  readonly code: string | null
}

function graphqlErrors(body: unknown): readonly GraphqlError[] {
  if (typeof body !== 'object' || body === null || !('errors' in body)) return []
  const { errors } = body
  if (!Array.isArray(errors)) return []
  return errors.map((error: unknown) => {
    if (typeof error !== 'object' || error === null) return { message: 'unknown error', code: null }
    const message = 'message' in error ? String(error.message) : 'unknown error'
    const extensions = 'extensions' in error ? error.extensions : null
    const code =
      typeof extensions === 'object' && extensions !== null && 'code' in extensions
        ? String(extensions.code)
        : null
    return { message, code }
  })
}

function readBody(text: string, ok: boolean, host: string): unknown {
  if (text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch (error) {
    if (!ok) return text
    throw new ProviderError('parse', `Ubisoft: invalid JSON from ${host}`, { cause: error })
  }
}
