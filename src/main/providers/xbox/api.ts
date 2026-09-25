import { ProviderError } from '@shared/errors'
import type { Secret } from '@shared/secret'
import { retryAfterMs } from '../http'

const LANGUAGE = 'en-GB'

export interface XboxReply {
  readonly ok: boolean
  readonly status: number
  readonly body: unknown
}

export interface XblRequestOptions {
  readonly auth: Secret
  readonly contractVersion: number
  readonly signal?: AbortSignal
}

export async function xblGet(
  url: string,
  { auth, contractVersion, signal }: XblRequestOptions,
): Promise<unknown> {
  const reply = await xboxFetch(url, {
    headers: {
      Authorization: auth.expose(),
      'x-xbl-contract-version': String(contractVersion),
      'Accept-Language': LANGUAGE,
      Accept: 'application/json',
    },
    signal,
  })
  const host = hostOf(url)
  if (reply.status === 401) {
    throw new ProviderError('auth_expired', `Xbox: ${host} rejected the sign-in`)
  }
  if (!reply.ok) {
    throw new ProviderError('other', `Xbox: unexpected reply from ${host} (HTTP ${reply.status})`)
  }
  if (reply.body === null) throw new ProviderError('parse', `Xbox: empty reply from ${host}`)
  return reply.body
}

export async function xboxFetch(url: string, init: RequestInit): Promise<XboxReply> {
  const host = hostOf(url)
  let response: Response
  let text: string
  try {
    response = await fetch(url, init)
    text = await response.text()
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new ProviderError('network', `Xbox: could not reach ${host}`, { cause: error })
  }

  if (response.status === 429) {
    throw new ProviderError('rate_limited', `Xbox: too many requests to ${host}`, {
      retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
    })
  }
  if (response.status >= 500) {
    throw new ProviderError('network', `Xbox: server error from ${host} (HTTP ${response.status})`)
  }
  return { ok: response.ok, status: response.status, body: readBody(text, response.ok, host) }
}

function readBody(text: string, ok: boolean, host: string): unknown {
  if (text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch (error) {
    if (!ok) return text
    throw new ProviderError('parse', `Xbox: invalid JSON from ${host}`, { cause: error })
  }
}

function hostOf(url: string): string {
  return new URL(url).host
}
