import { ProviderError } from '@shared/errors'
import type { Secret } from '@shared/secret'
import { retryAfterMs } from '../http'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EpicGamesLauncher'

const GRAPHQL_URL = 'https://launcher.store.epicgames.com/graphql'

export interface EpicReply {
  readonly ok: boolean
  readonly status: number
  readonly body: unknown
}

export interface EpicFetchInit {
  readonly method?: 'GET' | 'POST'
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string | URLSearchParams
  readonly signal?: AbortSignal
}

export interface EpicRequestOptions {
  readonly auth?: Secret
  readonly signal?: AbortSignal
}

export async function epicGet(url: string, { auth, signal }: EpicRequestOptions): Promise<unknown> {
  const reply = await epicFetch(url, {
    headers: { Accept: 'application/json', ...authHeader(auth) },
    signal,
  })
  const host = hostOf(url)
  if (reply.status === 401 || reply.status === 403) {
    throw new ProviderError('auth_expired', `Epic: ${host} rejected the sign-in`)
  }
  if (!reply.ok) {
    throw new ProviderError('other', `Epic: unexpected reply from ${host} (HTTP ${reply.status})`)
  }
  if (reply.body === null) throw new ProviderError('parse', `Epic: empty reply from ${host}`)
  return reply.body
}

export async function epicGraphql(
  query: string,
  variables: Readonly<Record<string, string>>,
  { auth, signal }: EpicRequestOptions,
): Promise<unknown> {
  const reply = await epicFetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeader(auth),
    },
    body: JSON.stringify({ query, variables }),
    signal,
  })
  const firstError = graphqlError(reply.body)
  if (firstError !== null) {
    throw new ProviderError('other', `Epic: the store refused a query (${firstError})`)
  }
  if (!reply.ok) {
    throw new ProviderError('other', `Epic: unexpected reply from the store (HTTP ${reply.status})`)
  }
  if (typeof reply.body !== 'object' || reply.body === null || !('data' in reply.body)) {
    throw new ProviderError('parse', 'Epic: the store replied without data')
  }
  return reply.body.data
}

export async function epicFetch(url: string, init: EpicFetchInit): Promise<EpicReply> {
  const host = hostOf(url)
  let response: Response
  let text: string
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...init.headers },
    })
    text = await response.text()
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new ProviderError('network', `Epic: could not reach ${host}`, { cause: error })
  }

  if (response.status === 429) {
    throw new ProviderError('rate_limited', `Epic: too many requests to ${host}`, {
      retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
    })
  }
  if (response.status >= 500) {
    throw new ProviderError('network', `Epic: server error from ${host} (HTTP ${response.status})`)
  }
  return { ok: response.ok, status: response.status, body: readBody(text, response.ok, host) }
}

function authHeader(auth: Secret | undefined): Record<string, string> {
  return auth ? { Authorization: auth.expose() } : {}
}

function graphqlError(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('errors' in body)) return null
  const { errors } = body
  if (!Array.isArray(errors) || errors.length === 0) return null
  const [first] = errors as unknown[]
  if (typeof first === 'object' && first !== null && 'message' in first) {
    return String(first.message)
  }
  return 'unknown error'
}

function readBody(text: string, ok: boolean, host: string): unknown {
  if (text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch (error) {
    if (!ok) return text
    throw new ProviderError('parse', `Epic: invalid JSON from ${host}`, { cause: error })
  }
}

function hostOf(url: string): string {
  return new URL(url).host
}
