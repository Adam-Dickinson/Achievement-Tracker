import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import {
  fetchEarnedTrophies,
  fetchProfile,
  fetchTitleTrophies,
  fetchTrophySummary,
  fetchTrophyTitles,
} from './api'

const TOKEN = new Secret('access-1')
const TROPHY = 'https://m.np.playstation.com/api/trophy/v1'
const PS5 = { service: 'trophy2', id: 'NPWR37356_00' }

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/playstation', name), 'utf8')
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })
}

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url))
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('PSN requests', () => {
  it('sends the access token and asks for English text', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture('trophy-summary.json')))

    await fetchTrophySummary(TOKEN)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${TROPHY}/users/me/trophySummary`)
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer access-1',
      'Accept-Language': 'en-US',
    })
  })

  it('asks for the profile of the signed-in account', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture('profile.json')))

    await fetchProfile('1234567890123456789', TOKEN)

    expect(requestedUrls()).toEqual([
      'https://m.np.playstation.com/api/userProfile/v1/internal/users/1234567890123456789/profiles',
    ])
  })

  it('asks for every trophy of a set, from the right trophy service', async () => {
    fetchMock
      .mockResolvedValueOnce(json(fixture('title-trophies-ps5.json')))
      .mockResolvedValueOnce(json(fixture('user-trophies-ps5.json')))

    const defined = await fetchTitleTrophies(PS5, TOKEN)
    const earned = await fetchEarnedTrophies(PS5, TOKEN)

    expect(requestedUrls()).toEqual([
      `${TROPHY}/npCommunicationIds/NPWR37356_00/trophyGroups/all/trophies?npServiceName=trophy2`,
      `${TROPHY}/users/me/npCommunicationIds/NPWR37356_00/trophyGroups/all/trophies?npServiceName=trophy2`,
    ])
    expect(defined).toHaveLength(1)
    expect(earned).toHaveLength(1)
  })

  it('follows nextOffset through every page of the title list', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ trophyTitles: [], totalItemCount: 1600, nextOffset: 800 }))
      .mockResolvedValueOnce(json({ trophyTitles: [], totalItemCount: 1600 }))

    const pages = await fetchTrophyTitles(TOKEN)

    expect(pages).toHaveLength(2)
    expect(requestedUrls()).toEqual([
      `${TROPHY}/users/me/trophyTitles?limit=800`,
      `${TROPHY}/users/me/trophyTitles?limit=800&offset=800`,
    ])
  })

  it('stops at an offset that does not move forward', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ trophyTitles: [], nextOffset: 1 })))

    const pages = await fetchTrophyTitles(TOKEN)

    expect(pages).toHaveLength(2)
  })

  it('reports a rejected token as auth_expired', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture('error-invalid-token.json'), 401))

    expect((await errorFrom(fetchTrophyTitles(TOKEN))).kind).toBe('auth_expired')
  })

  it('reports an unknown trophy list as not retryable', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture('error-not-found.json'), 404))

    const error = await errorFrom(fetchTitleTrophies(PS5, TOKEN))

    expect(error.kind).toBe('other')
    expect(error.isRetryable).toBe(false)
  })

  it('reports 429 as rate_limited with the Retry-After delay', async () => {
    fetchMock.mockResolvedValueOnce(json('{}', 429, { 'Retry-After': '120' }))

    const error = await errorFrom(fetchTrophyTitles(TOKEN))

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterMs).toBe(120_000)
  })

  it('reports a failed connection as a network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    expect((await errorFrom(fetchTrophySummary(TOKEN))).kind).toBe('network')
  })

  it('reports invalid JSON in a successful reply as a parse error', async () => {
    fetchMock.mockResolvedValueOnce(json('<html>'))

    expect((await errorFrom(fetchTrophySummary(TOKEN))).kind).toBe('parse')
  })

  it('passes a cancellation straight through', async () => {
    const controller = new AbortController()
    controller.abort()
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))

    await expect(fetchTrophySummary(TOKEN, controller.signal)).rejects.toThrow('aborted')
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })
})
