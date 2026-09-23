import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { steamGet } from './api'

const KEY = new Secret('0123456789ABCDEF0123456789ABCDEF')
const JSON_TYPE = 'application/json; charset=UTF-8'
const HTML_TYPE = 'text/html; charset=UTF-8'

function fixtureText(name: string): string {
  return readFileSync(resolve('tests/fixtures/steam', name), 'utf8')
}

function reply(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  expect(error.message).not.toContain(KEY.expose())
  return error
}

function requestedUrl(): URL {
  const input = fetchMock.mock.calls[0]?.[0]
  if (!(input instanceof URL)) throw new Error('fetch was not called with a URL')
  return input
}

describe('steamGet', () => {
  it('calls the Steam Web API with the params and key, and returns the parsed JSON', async () => {
    fetchMock.mockResolvedValue(
      reply('{"response":{"players":[]}}', 200, { 'content-type': JSON_TYPE }),
    )

    const json = await steamGet(
      '/ISteamUser/GetPlayerSummaries/v2/',
      { steamids: '7656', n: 1 },
      { key: KEY },
    )

    expect(json).toEqual({ response: { players: [] } })
    const url = requestedUrl()
    expect(url.origin + url.pathname).toBe(
      'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/',
    )
    expect(url.searchParams.get('steamids')).toBe('7656')
    expect(url.searchParams.get('n')).toBe('1')
    expect(url.searchParams.get('key')).toBe(KEY.expose())
  })

  it('sends no key when none is given (rarity needs none)', async () => {
    fetchMock.mockResolvedValue(reply('{}', 200, { 'content-type': JSON_TYPE }))

    await steamGet('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/', { gameid: 1 })

    expect(requestedUrl().searchParams.has('key')).toBe(false)
  })

  it('passes the abort signal to fetch', async () => {
    fetchMock.mockResolvedValue(reply('{}', 200, { 'content-type': JSON_TYPE }))
    const signal = new AbortController().signal

    await steamGet('/x/', {}, { signal })

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ signal })
  })

  it('returns a JSON body even on a 403, for the parser to judge (rarity for an unknown app)', async () => {
    fetchMock.mockResolvedValue(
      reply(fixtureText('global-pct-unknown-app.json'), 403, { 'content-type': JSON_TYPE }),
    )

    await expect(steamGet('/x/', {})).resolves.toEqual({})
  })

  it('returns a JSON body even on a 400, for the parser to judge (a game without stats)', async () => {
    fetchMock.mockResolvedValue(
      reply(fixtureText('player-achievements-no-stats.json'), 400, { 'content-type': JSON_TYPE }),
    )

    await expect(steamGet('/x/', {})).resolves.toEqual({
      playerstats: { error: 'Requested app has no stats', success: false },
    })
  })

  it('reports a rejected key (Steam’s HTML 403) as auth_expired', async () => {
    fetchMock.mockResolvedValue(
      reply(fixtureText('error-bad-key.html'), 403, { 'content-type': HTML_TYPE }),
    )

    expect((await errorFrom(steamGet('/x/', {}, { key: KEY }))).kind).toBe('auth_expired')
  })

  it('reports a 401 without JSON as auth_expired', async () => {
    fetchMock.mockResolvedValue(reply('Unauthorized', 401))

    expect((await errorFrom(steamGet('/x/', {}, { key: KEY }))).kind).toBe('auth_expired')
  })

  it('reports a 429 as rate_limited, using Retry-After in seconds', async () => {
    fetchMock.mockResolvedValue(reply('', 429, { 'retry-after': '120' }))

    const error = await errorFrom(steamGet('/x/', {}, { key: KEY }))

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterMs).toBe(120_000)
  })

  it('reads a Retry-After given as a date', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-23T12:00:00Z') })
    fetchMock.mockResolvedValue(reply('', 429, { 'retry-after': 'Wed, 23 Sep 2026 12:01:30 GMT' }))

    expect((await errorFrom(steamGet('/x/', {}))).retryAfterMs).toBe(90_000)
  })

  it('leaves the retry delay to the scheduler when Retry-After is missing or unreadable', async () => {
    fetchMock.mockResolvedValueOnce(reply('', 429))
    fetchMock.mockResolvedValueOnce(reply('', 429, { 'retry-after': 'soon' }))

    expect((await errorFrom(steamGet('/x/', {}))).retryAfterMs).toBeNull()
    expect((await errorFrom(steamGet('/x/', {}))).retryAfterMs).toBeNull()
  })

  it.each([500, 502, 503])(
    'reports HTTP %i as a network error, so it is retried',
    async (status) => {
      fetchMock.mockResolvedValue(reply('<html>oops</html>', status, { 'content-type': HTML_TYPE }))

      expect((await errorFrom(steamGet('/x/', {}, { key: KEY }))).kind).toBe('network')
    },
  )

  it('reports a failed connection as a network error, keeping the cause', async () => {
    const cause = new TypeError('fetch failed')
    fetchMock.mockRejectedValue(cause)

    const error = await errorFrom(steamGet('/x/', {}, { key: KEY }))

    expect(error.kind).toBe('network')
    expect(error.cause).toBe(cause)
  })

  it('rethrows the abort as it is when the request was cancelled', async () => {
    const controller = new AbortController()
    const abort = new DOMException('This operation was aborted', 'AbortError')
    fetchMock.mockImplementation(() => {
      controller.abort()
      return Promise.reject(abort)
    })

    await expect(steamGet('/x/', {}, { signal: controller.signal })).rejects.toBe(abort)
  })

  it('reports a JSON content type with a broken body as a parse error', async () => {
    fetchMock.mockResolvedValue(reply('{"response":', 200, { 'content-type': JSON_TYPE }))

    expect((await errorFrom(steamGet('/x/', {}, { key: KEY }))).kind).toBe('parse')
  })

  it('reports a 200 that is not JSON as a parse error', async () => {
    fetchMock.mockResolvedValue(
      reply('<html>maintenance</html>', 200, { 'content-type': HTML_TYPE }),
    )

    expect((await errorFrom(steamGet('/x/', {}, { key: KEY }))).kind).toBe('parse')
  })

  it('reports any other non-JSON failure (Steam’s HTML 400) as other', async () => {
    fetchMock.mockResolvedValue(
      reply(fixtureText('error-missing-key.html'), 400, { 'content-type': HTML_TYPE }),
    )

    const error = await errorFrom(steamGet('/x/', {}, { key: KEY }))

    expect(error.kind).toBe('other')
    expect(error.message).toContain('HTTP 400')
  })
})
