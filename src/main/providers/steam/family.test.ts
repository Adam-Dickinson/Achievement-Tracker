import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import {
  familySteamId,
  fetchFamilyApps,
  fetchStoreAchievementFlags,
  readFamilySignIn,
  readSteamSecret,
  requestFamilyToken,
  toFamilyGame,
  withFamily,
} from './family'

const STEAM_ID = '76561198000000001'
const REFRESH = new Secret(`${STEAM_ID}%7C%7Cfake.refresh.token`)
const KEY = '0123456789ABCDEF0123456789ABCDEF'
const EXPIRES = Date.UTC(2026, 8, 26, 20, 0, 0) / 1000
const SESSION_JWT = `header.${Buffer.from(JSON.stringify({ exp: EXPIRES })).toString('base64url')}.signature`

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/steam', name), 'utf8')
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function json(body: string, status = 200, setCookies: readonly string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  for (const line of setCookies) headers.append('Set-Cookie', line)
  return new Response(body, { status, headers })
}

function signedIn(): Response {
  return json('', 200, [
    `steamLoginSecure=${STEAM_ID}%7C%7C${SESSION_JWT}; Path=/; Secure; HttpOnly`,
  ])
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('the stored Steam secret', () => {
  it('reads a plain API key, as saved before the family library existed', () => {
    const { key, family } = readSteamSecret(new Secret(KEY))

    expect(key.expose()).toBe(KEY)
    expect(family).toBeNull()
  })

  it('adds the family sign-in next to the key, and reads both back', () => {
    const stored = withFamily(new Secret(KEY), REFRESH)
    const { key, family } = readSteamSecret(stored)

    expect(key.expose()).toBe(KEY)
    expect(family?.expose()).toBe(REFRESH.expose())
    expect(readSteamSecret(withFamily(stored, new Secret('newer'))).family?.expose()).toBe('newer')
  })

  it('reports a stored value it cannot read as expired', () => {
    expect(() => readSteamSecret(new Secret('{"family":"x"}'))).toThrow(ProviderError)
    expect(() => readSteamSecret(new Secret('{not json'))).toThrow('not usable')
  })
})

describe('readFamilySignIn', () => {
  it("keeps only Steam's refresh cookie from the sign-in window", () => {
    const secret = readFamilySignIn([
      { name: 'steamLoginSecure', value: 'session' },
      { name: 'steamRefresh_steam', value: REFRESH.expose() },
      { name: 'sessionid', value: 'x' },
    ])

    expect(secret?.expose()).toBe(REFRESH.expose())
    expect(secret && familySteamId(secret)).toBe(STEAM_ID)
  })

  it('waits while there is no refresh cookie, or one without a SteamID', () => {
    expect(readFamilySignIn([{ name: 'steamLoginSecure', value: 'session' }])).toBeNull()
    expect(readFamilySignIn([{ name: 'steamRefresh_steam', value: 'nobody%7C%7Cx' }])).toBeNull()
  })
})

describe('requestFamilyToken', () => {
  it('trades the refresh cookie for a 24-hour store session, as the Steam website does', async () => {
    fetchMock
      .mockResolvedValueOnce(json(fixture('family-refresh-ticket.json')))
      .mockResolvedValueOnce(signedIn())

    const token = await requestFamilyToken(REFRESH)

    expect(token.token).toBeInstanceOf(Secret)
    expect(token.token.expose()).toBe(SESSION_JWT)
    expect(token.expiresAt).toEqual(new Date(EXPIRES * 1000))

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[0] ?? []
    expect(refreshUrl).toBe('https://login.steampowered.com/jwt/ajaxrefresh')
    expect(refreshInit?.method).toBe('POST')
    expect(refreshInit?.headers).toMatchObject({
      Cookie: `steamRefresh_steam=${REFRESH.expose()}`,
      Origin: 'https://store.steampowered.com',
      Referer: 'https://store.steampowered.com/',
    })
    const [setTokenUrl, setTokenInit] = fetchMock.mock.calls[1] ?? []
    expect(setTokenUrl).toBe('https://store.steampowered.com/login/settoken')
    expect(Object.fromEntries(new URLSearchParams(String(setTokenInit?.body)))).toEqual({
      steamID: STEAM_ID,
      nonce: 'fake-nonce',
      redir: '/',
      auth: 'fake-auth',
    })
  })

  it('reports a refresh cookie Steam no longer accepts (error 79) as expired', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture('family-refresh-expired.json')))

    expect((await errorFrom(requestFamilyToken(REFRESH))).kind).toBe('auth_expired')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('never posts the ticket anywhere but the Steam store', async () => {
    const ticket = {
      ...JSON.parse(fixture('family-refresh-ticket.json')),
      login_url: 'https://evil.example/',
    }
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(ticket)))

    expect((await errorFrom(requestFamilyToken(REFRESH))).kind).toBe('parse')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reports a store that sets no session as expired', async () => {
    fetchMock
      .mockResolvedValueOnce(json(fixture('family-refresh-ticket.json')))
      .mockResolvedValueOnce(json('', 200, ['sessionid=x; Path=/']))

    expect((await errorFrom(requestFamilyToken(REFRESH))).kind).toBe('auth_expired')
  })

  it('reports a refused request (Steam answers 403 without browser headers) as an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }))

    expect((await errorFrom(requestFamilyToken(REFRESH))).kind).toBe('other')
  })

  it('reports failed connections and server errors as retryable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await errorFrom(requestFamilyToken(REFRESH))).kind).toBe('network')

    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    expect((await errorFrom(requestFamilyToken(REFRESH))).kind).toBe('network')
  })
})

describe('fetchFamilyApps', () => {
  function answer(url: URL): Response {
    if (url.pathname.includes('GetFamilyGroupForUser')) return json(fixture('family-group.json'))
    return json(fixture('family-shared-library.json'))
  }

  it("keeps the shareable games other family members own, with the player's own last play", async () => {
    fetchMock.mockImplementation((input) => Promise.resolve(answer(new URL(String(input)))))

    const apps = await fetchFamilyApps(new Secret('token'), STEAM_ID)

    expect(apps).toHaveLength(25)
    expect(apps.find((app) => app.appid === '220')).toEqual({
      appid: '220',
      name: 'Half-Life 2',
      iconHash: 'fcfb366051782b8ebf2aa297f3b746395858cb62',
      lastPlayed: null,
    })
    expect(apps.find((app) => app.appid === '289070')?.lastPlayed).toEqual(
      new Date('2026-09-04T17:45:45.000Z'),
    )
  })

  it('asks for the family group, then its library, with the session token', async () => {
    fetchMock.mockImplementation((input) => Promise.resolve(answer(new URL(String(input)))))

    await fetchFamilyApps(new Secret('token'), STEAM_ID)

    const [group, library] = fetchMock.mock.calls.map(([input]) => new URL(String(input)))
    expect(group?.searchParams.get('access_token')).toBe('token')
    expect(group?.searchParams.get('steamid')).toBe(STEAM_ID)
    expect(library?.searchParams.get('family_groupid')).toBe('1000001')
  })

  it('finds nothing for an account outside any family', async () => {
    fetchMock.mockResolvedValue(json(fixture('family-group-none.json')))

    expect(await fetchFamilyApps(new Secret('token'), STEAM_ID)).toEqual([])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reports a rejected session as expired', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Unauthorized</html>', {
        status: 401,
        headers: { 'content-type': 'text/html' },
      }),
    )

    const error = await errorFrom(fetchFamilyApps(new Secret('token'), STEAM_ID))

    expect(error.kind).toBe('auth_expired')
    expect(error.message).toContain('family library session')
  })
})

describe('fetchStoreAchievementFlags', () => {
  it('reads "Steam Achievements" from the store, and leaves delisted games unknown', async () => {
    fetchMock.mockResolvedValue(json(fixture('family-store-items.json')))

    const flags = await fetchStoreAchievementFlags(['220', '10', '43160'])

    expect(flags).toEqual(
      new Map([
        ['220', true],
        ['10', false],
        ['43160', null],
      ]),
    )
  })

  it('asks the store about at most 50 games at a time', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json('{"response":{}}')))
    const appids = Array.from({ length: 120 }, (_, i) => String(i + 1))

    const flags = await fetchStoreAchievementFlags(appids)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const input = JSON.parse(
      new URL(String(fetchMock.mock.calls[2]?.[0])).searchParams.get('input_json') ?? '{}',
    ) as { ids: unknown[] }
    expect(input.ids).toHaveLength(20)
    expect([...flags.values()].every((flag) => flag === null)).toBe(true)
  })
})

describe('toFamilyGame', () => {
  const now = new Date('2026-09-10T00:00:00.000Z')

  it("builds a library game with Steam's icon and header art", () => {
    const game = toFamilyGame(
      { appid: '220', name: 'Half-Life 2', iconHash: 'abc', lastPlayed: null },
      now,
    )

    expect(game).toEqual({
      ref: { externalId: '220' },
      title: 'Half-Life 2',
      iconUrl: 'https://media.steampowered.com/steamcommunity/public/images/apps/220/abc.jpg',
      coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/220/header.jpg',
      lastPlayed: null,
      recentlyPlayed: false,
    })
  })

  it('marks a game played in the last two weeks as recent', () => {
    const played = new Date('2026-09-04T00:00:00.000Z')

    expect(
      toFamilyGame({ appid: '1', name: 'x', iconHash: null, lastPlayed: played }, now),
    ).toMatchObject({ iconUrl: null, recentlyPlayed: true })
  })
})
