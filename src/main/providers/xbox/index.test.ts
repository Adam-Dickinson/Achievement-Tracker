import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type { AccountCredentials } from '@shared/models'
import { Secret } from '@shared/secret'
import { XboxProvider } from './index'

const XUID = '2535400000000001'
const NOW = new Date('2026-09-24T12:00:00Z')
const XSTS_EXPIRES = new Date('2026-09-25T10:03:48.2013242Z')

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/xbox', name), 'utf8')
}

type Route = (url: URL, init: RequestInit | undefined) => Response

const fetchMock = vi.fn<typeof fetch>()
const routes = new Map<string, Route>()

function route(prefix: string, handler: Route): void {
  routes.set(prefix, handler)
}

function json(body: string, status = 200): Response {
  return new Response(body, { status })
}

function calls(prefix: string): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.toString().startsWith(prefix))
}

function signInRoutes(): void {
  route('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', (_url, init) => {
    const form = init?.body as URLSearchParams
    return json(
      fixture(form.get('grant_type') === 'refresh_token' ? 'ms-refresh.json' : 'ms-token.json'),
    )
  })
  route('https://user.auth.xboxlive.com/', () => json(fixture('user-token.json')))
  route('https://xsts.auth.xboxlive.com/', () => json(fixture('xsts.json')))
}

const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const TITLEHUB = `https://titlehub.xboxlive.com/users/xuid(${XUID})/titles/titlehistory/decoration/achievement,image`
const ACHIEVEMENTS = `https://achievements.xboxlive.com/users/xuid(${XUID})/achievements`

let now = NOW

beforeEach(() => {
  now = NOW
  routes.clear()
  signInRoutes()
  fetchMock.mockImplementation((input, init) => {
    const url = new URL(String(input))
    for (const [prefix, handler] of routes) {
      if (url.toString().startsWith(prefix)) return Promise.resolve(handler(url, init))
    }
    return Promise.reject(new Error(`unexpected request to ${url.toString()}`))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function provider(): XboxProvider {
  return new XboxProvider({ now: () => now })
}

function stored(token = 'fake-stored-refresh-token'): AccountCredentials {
  return { platform: 'xbox', externalId: XUID, secret: new Secret(token) }
}

function sentRefreshToken(index: number): string | null {
  const tokenCalls = fetchMock.mock.calls.filter(([input]) => String(input) === TOKEN_URL)
  return (tokenCalls[index]?.[1]?.body as URLSearchParams | undefined)?.get('refresh_token') ?? null
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('XboxProvider capabilities', () => {
  it('is an unofficial OAuth provider with rarity', () => {
    expect(provider().capabilities).toEqual({
      localWatch: false,
      polling: true,
      globalRarity: true,
      oauth: true,
      unofficial: true,
    })
  })
})

describe('XboxProvider.authenticate', () => {
  it('trades the sign-in code for credentials keyed by the XUID', async () => {
    const credentials = await provider().authenticate({
      kind: 'oauth_code',
      code: 'the-code',
      redirectUri: 'http://localhost:1234',
      codeVerifier: new Secret('the-verifier'),
    })

    expect(credentials.platform).toBe('xbox')
    expect(credentials.externalId).toBe(XUID)
    expect(credentials.secret?.expose()).toBe('fake-ms-refresh-token')
  })

  it('keeps the session, so validating straight after needs no requests', async () => {
    const xbox = provider()
    const credentials = await xbox.authenticate({
      kind: 'oauth_code',
      code: 'c',
      redirectUri: 'http://localhost:1',
      codeVerifier: new Secret('v'),
    })
    fetchMock.mockClear()

    expect(await xbox.validate(credentials)).toEqual({
      externalId: XUID,
      displayName: 'SampleGamer',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses any other way of connecting', async () => {
    const error = await errorFrom(
      provider().authenticate({ kind: 'token', value: new Secret('x') }),
    )

    expect(error.kind).toBe('unsupported')
  })
})

describe('XboxProvider.refresh', () => {
  it('signs in with the stored refresh token and returns the rotated one', async () => {
    const refreshed = await provider().refresh(stored())

    expect(sentRefreshToken(0)).toBe('fake-stored-refresh-token')
    expect(refreshed.secret?.expose()).toBe('fake-ms-refresh-token-2')
    expect(refreshed.externalId).toBe(XUID)
  })

  it('makes no requests while the session is still valid', async () => {
    const xbox = provider()
    await xbox.refresh(stored())
    fetchMock.mockClear()

    now = new Date(XSTS_EXPIRES.getTime() - 10 * 60_000)
    const again = await xbox.refresh(stored())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(again.secret?.expose()).toBe('fake-ms-refresh-token-2')
  })

  it('signs in again shortly before the session expires, with the latest refresh token', async () => {
    const xbox = provider()
    await xbox.refresh(stored())

    now = new Date(XSTS_EXPIRES.getTime() - 60_000)
    await xbox.refresh(stored())

    expect(sentRefreshToken(1)).toBe('fake-ms-refresh-token-2')
  })

  it('reports a rejected refresh token as an expired sign-in', async () => {
    route(TOKEN_URL, () => json('{"error":"invalid_grant"}', 400))

    expect((await errorFrom(provider().refresh(stored()))).kind).toBe('auth_expired')
  })

  it('reports an account with nothing stored as an expired sign-in', async () => {
    const error = await errorFrom(
      provider().refresh({ platform: 'xbox', externalId: XUID, secret: null }),
    )

    expect(error.kind).toBe('auth_expired')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a stored sign-in that belongs to a different Xbox account', async () => {
    const error = await errorFrom(
      provider().refresh({ ...stored(), externalId: '2535499999999999' }),
    )

    expect(error.kind).toBe('other')
    expect(error.message).toContain('different account')
  })
})

describe('XboxProvider.listGames', () => {
  it('reads the title history with contract 2 and keeps the Xbox games', async () => {
    route(TITLEHUB, () => json(fixture('titlehub-history.json')))

    const games = await provider().listGames(stored())

    expect(games.map((game) => game.ref.externalId)).toEqual(['2079757188', '1889714780'])
    const request = fetchMock.mock.calls.find(([input]) => String(input) === TITLEHUB)
    const headers = new Headers(request?.[1]?.headers)
    expect(headers.get('x-xbl-contract-version')).toBe('2')
    expect(headers.get('authorization')).toBe('XBL3.0 x=1234567890123456789;fake-xsts-token')
  })

  it('uses the provider clock to decide which games were played recently', async () => {
    route(TITLEHUB, () => json(fixture('titlehub-history.json')))
    now = new Date('2026-06-05T00:00:00Z')

    const [forza] = await provider().listGames(stored())

    expect(forza?.recentlyPlayed).toBe(true)
  })

  it('signs in again and retries once when Xbox Live rejects the session', async () => {
    let attempts = 0
    route(TITLEHUB, () => {
      attempts++
      return attempts === 1 ? json('', 401) : json(fixture('titlehub-history.json'))
    })

    const games = await provider().listGames(stored())

    expect(games).toHaveLength(2)
    expect(calls(TOKEN_URL)).toHaveLength(2)
    expect(sentRefreshToken(1)).toBe('fake-ms-refresh-token-2')
  })

  it('gives up with an expired sign-in when the retry is rejected too', async () => {
    route(TITLEHUB, () => json('', 401))

    expect((await errorFrom(provider().listGames(stored()))).kind).toBe('auth_expired')
    expect(calls(TITLEHUB)).toHaveLength(2)
  })

  it('does not retry other errors', async () => {
    route(TITLEHUB, () => json('', 503))

    expect((await errorFrom(provider().listGames(stored()))).kind).toBe('network')
    expect(calls(TITLEHUB)).toHaveLength(1)
  })
})

describe('XboxProvider.fetchGame', () => {
  it('asks for up to 1000 achievements at once with contract 4', async () => {
    route(ACHIEVEMENTS, () => json(fixture('achievements-2001700854.json')))

    const result = await provider().fetchGame(stored(), { externalId: '2001700854' })

    expect(result.achievements).toHaveLength(5)
    expect(result.unlocks.map((unlock) => unlock.achievementExternalId)).toEqual(['66', '90'])
    const [url] = calls(ACHIEVEMENTS)
    expect(url?.searchParams.get('titleId')).toBe('2001700854')
    expect(url?.searchParams.get('maxItems')).toBe('1000')
    expect(url?.searchParams.has('continuationToken')).toBe(false)
    const request = fetchMock.mock.calls.find(([input]) => String(input).startsWith(ACHIEVEMENTS))
    expect(new Headers(request?.[1]?.headers).get('x-xbl-contract-version')).toBe('4')
  })

  it('follows the continuation token until the last page', async () => {
    route(ACHIEVEMENTS, (url) =>
      json(
        fixture(
          url.searchParams.get('continuationToken') === '32'
            ? 'achievements-2079757188-page2.json'
            : 'achievements-2079757188-page1.json',
        ),
      ),
    )

    const result = await provider().fetchGame(stored(), { externalId: '2079757188' })

    expect(result.achievements.map((a) => a.externalId)).toEqual(['1', '2', '33', '34'])
    expect(calls(ACHIEVEMENTS).map((url) => url.searchParams.get('continuationToken'))).toEqual([
      null,
      '32',
    ])
  })

  it('stops with a parse error when the pages never end', async () => {
    route(ACHIEVEMENTS, () => json(fixture('achievements-2079757188-page1.json')))

    const error = await errorFrom(provider().fetchGame(stored(), { externalId: '2079757188' }))

    expect(error.kind).toBe('parse')
    expect(calls(ACHIEVEMENTS)).toHaveLength(20)
  })

  it('returns nothing for the empty reply a game without achievements gives', async () => {
    route(ACHIEVEMENTS, () => json(fixture('achievements-empty.json')))

    expect(await provider().fetchGame(stored(), { externalId: '1' })).toEqual({
      achievements: [],
      unlocks: [],
    })
  })

  it('shares one sign-in between the library and every game', async () => {
    route(TITLEHUB, () => json(fixture('titlehub-history.json')))
    route(ACHIEVEMENTS, () => json(fixture('achievements-empty.json')))
    const xbox = provider()

    await xbox.listGames(stored())
    await xbox.fetchGame(stored(), { externalId: '1' })
    await xbox.fetchGame(stored(), { externalId: '2' })

    expect(calls(TOKEN_URL)).toHaveLength(1)
  })
})
