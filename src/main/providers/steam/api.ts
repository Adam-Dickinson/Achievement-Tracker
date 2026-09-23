import { ProviderError } from '@shared/errors'
import type { Secret } from '@shared/secret'

const STEAM_API = 'https://api.steampowered.com'

export interface SteamRequestOptions {
  readonly key?: Secret
  readonly signal?: AbortSignal
}

// Error messages never include the URL: the key is in its query string (docs/PROVIDERS.md).
export async function steamGet(
  path: string,
  params: Readonly<Record<string, string | number>>,
  { key, signal }: SteamRequestOptions = {},
): Promise<unknown> {
  const url = new URL(path, STEAM_API)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value))
  if (key) url.searchParams.set('key', key.expose())

  let response: Response
  let body: string
  try {
    response = await fetch(url, { signal })
    body = await response.text()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ProviderError('network', `Steam: could not reach ${path}`, { cause: error })
  }

  if (response.status === 429) {
    throw new ProviderError('rate_limited', 'Steam: too many requests', {
      retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
    })
  }
  if (response.status >= 500) {
    throw new ProviderError('network', `Steam: server error (HTTP ${response.status})`)
  }

  // Steam also answers some failures with JSON (a 403 `{}`, a 400 "no stats"): the parsers decide.
  if (response.headers.get('content-type')?.includes('application/json')) {
    try {
      return JSON.parse(body)
    } catch (error) {
      throw new ProviderError('parse', `Steam: invalid JSON from ${path}`, { cause: error })
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError('auth_expired', 'Steam: the API key was rejected')
  }
  throw new ProviderError(
    response.ok ? 'parse' : 'other',
    `Steam: unexpected reply from ${path} (HTTP ${response.status})`,
  )
}

function retryAfterMs(header: string | null): number | undefined {
  if (header === null || header.trim() === '') return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}
