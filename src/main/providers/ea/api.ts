import { ProviderError } from '@shared/errors'
import type { Secret } from '@shared/secret'
import { retryAfterMs } from '../http'

const GRAPHQL_URL = 'https://service-aggregation-layer.juno.ea.com/graphql'
const ACHIEVEMENTS_URL = 'https://achievements.gameservices.ea.com/achievements/personas'
const REJECTED_TOKEN_CODES = new Set(['UNAUTHENTICATED', 'UNAUTHORIZED'])

export interface EaReply {
  readonly ok: boolean
  readonly status: number
  readonly body: unknown
  readonly setCookies: readonly string[]
}

export interface EaFetchInit {
  readonly headers?: Readonly<Record<string, string>>
  readonly signal?: AbortSignal
}

export async function eaGraphql(
  query: string,
  token: Secret,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = `${GRAPHQL_URL}?query=${encodeURIComponent(query)}`
  const reply = await eaFetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token.expose()}` },
    signal,
  })
  const errors = graphqlErrors(reply.body)
  if (reply.status === 401 || errors.some((e) => e.code && REJECTED_TOKEN_CODES.has(e.code))) {
    throw new ProviderError('auth_expired', 'EA: the EA app rejected the token')
  }
  const [first] = errors
  if (first) {
    throw new ProviderError('other', `EA: the EA app refused a query (${first.message})`)
  }
  if (!reply.ok) {
    throw new ProviderError('other', `EA: unexpected reply from the EA app (HTTP ${reply.status})`)
  }
  if (typeof reply.body !== 'object' || reply.body === null || !('data' in reply.body)) {
    throw new ProviderError('parse', 'EA: the EA app replied without data')
  }
  return reply.body.data
}

export async function eaAchievements(
  personaId: string,
  achievementSetId: string,
  token: Secret,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = `${ACHIEVEMENTS_URL}/${encodeURIComponent(personaId)}/${encodeURIComponent(achievementSetId)}/all?lang=en_US&metadata=true`
  const reply = await eaFetch(url, {
    headers: { Accept: 'application/json', 'X-AuthToken': token.expose() },
    signal,
  })
  if (reply.status === 401 || reply.status === 403) {
    throw new ProviderError('auth_expired', 'EA: the achievements service rejected the token')
  }
  if (!reply.ok) {
    throw new ProviderError(
      'other',
      `EA: unexpected reply from the achievements service (HTTP ${reply.status})`,
    )
  }
  return reply.body
}

export async function eaFetch(url: string, init: EaFetchInit): Promise<EaReply> {
  const host = new URL(url).host
  let response: Response
  let text: string
  try {
    response = await fetch(url, init)
    text = await response.text()
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new ProviderError('network', `EA: could not reach ${host}`, { cause: error })
  }

  if (response.status === 429) {
    throw new ProviderError('rate_limited', `EA: too many requests to ${host}`, {
      retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
    })
  }
  if (response.status >= 500) {
    throw new ProviderError('network', `EA: server error from ${host} (HTTP ${response.status})`)
  }
  return {
    ok: response.ok,
    status: response.status,
    body: readBody(text, response.ok, host),
    setCookies: response.headers.getSetCookie(),
  }
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
    throw new ProviderError('parse', `EA: invalid JSON from ${host}`, { cause: error })
  }
}
