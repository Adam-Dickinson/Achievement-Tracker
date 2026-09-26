import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type { Secret } from '@shared/secret'
import { retryAfterMs } from '../http'
import type { TrophySet } from './parse'

const TROPHY_URL = 'https://m.np.playstation.com/api/trophy/v1'
const PROFILE_URL = 'https://m.np.playstation.com/api/userProfile/v1/internal/users'
const TITLES_PAGE_SIZE = 800
const MAX_PAGES = 50

const pageSchema = z.object({ nextOffset: z.number().int().positive().nullish() })

export interface PsnReply {
  readonly ok: boolean
  readonly status: number
  readonly body: unknown
  readonly location: string | null
}

export interface PsnFetchInit {
  readonly method?: 'GET' | 'POST'
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: URLSearchParams
  readonly redirect?: 'manual'
  readonly signal?: AbortSignal
}

export function fetchTrophySummary(token: Secret, signal?: AbortSignal): Promise<unknown> {
  return psnGet(`${TROPHY_URL}/users/me/trophySummary`, token, signal)
}

export function fetchProfile(
  accountId: string,
  token: Secret,
  signal?: AbortSignal,
): Promise<unknown> {
  return psnGet(`${PROFILE_URL}/${encodeURIComponent(accountId)}/profiles`, token, signal)
}

export function fetchTrophyTitles(token: Secret, signal?: AbortSignal): Promise<unknown[]> {
  return psnPages(`${TROPHY_URL}/users/me/trophyTitles?limit=${TITLES_PAGE_SIZE}`, token, signal)
}

export function fetchTitleTrophies(
  set: TrophySet,
  token: Secret,
  signal?: AbortSignal,
): Promise<unknown[]> {
  return psnPages(`${TROPHY_URL}/npCommunicationIds/${trophiesPath(set)}`, token, signal)
}

export function fetchEarnedTrophies(
  set: TrophySet,
  token: Secret,
  signal?: AbortSignal,
): Promise<unknown[]> {
  return psnPages(`${TROPHY_URL}/users/me/npCommunicationIds/${trophiesPath(set)}`, token, signal)
}

export async function psnFetch(url: string, init: PsnFetchInit): Promise<PsnReply> {
  const host = new URL(url).host
  let response: Response
  let text: string
  try {
    response = await fetch(url, init)
    text = await response.text()
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new ProviderError('network', `PlayStation: could not reach ${host}`, { cause: error })
  }

  if (response.status === 429) {
    throw new ProviderError('rate_limited', `PlayStation: too many requests to ${host}`, {
      retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
    })
  }
  if (response.status >= 500) {
    throw new ProviderError(
      'network',
      `PlayStation: server error from ${host} (HTTP ${response.status})`,
    )
  }
  return {
    ok: response.ok,
    status: response.status,
    body: readBody(text, response.ok, host),
    location: response.headers.get('location'),
  }
}

async function psnGet(url: string, token: Secret, signal?: AbortSignal): Promise<unknown> {
  const reply = await psnFetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-US',
      Authorization: `Bearer ${token.expose()}`,
    },
    signal,
  })
  if (reply.status === 401 || reply.status === 403) {
    throw new ProviderError('auth_expired', 'PlayStation: PSN rejected the token')
  }
  if (reply.status === 404) {
    throw new ProviderError('other', 'PlayStation: PSN has no such trophy list')
  }
  if (!reply.ok) {
    throw new ProviderError(
      'other',
      `PlayStation: unexpected reply from PSN (HTTP ${reply.status})`,
    )
  }
  return reply.body
}

async function psnPages(url: string, token: Secret, signal?: AbortSignal): Promise<unknown[]> {
  const pages: unknown[] = []
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const separator = url.includes('?') ? '&' : '?'
    const body = await psnGet(
      offset === 0 ? url : `${url}${separator}offset=${offset}`,
      token,
      signal,
    )
    pages.push(body)
    const next = pageSchema.safeParse(body).data?.nextOffset
    if (!next || next <= offset) return pages
    offset = next
  }
  throw new ProviderError('parse', `PlayStation: more than ${MAX_PAGES} pages from PSN`)
}

function trophiesPath(set: TrophySet): string {
  return `${encodeURIComponent(set.id)}/trophyGroups/all/trophies?npServiceName=${encodeURIComponent(set.service)}`
}

function readBody(text: string, ok: boolean, host: string): unknown {
  if (text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch (error) {
    if (!ok) return text
    throw new ProviderError('parse', `PlayStation: invalid JSON from ${host}`, { cause: error })
  }
}
