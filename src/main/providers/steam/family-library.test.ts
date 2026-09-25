import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountCredentials } from '@shared/models'
import { Secret } from '@shared/secret'
import { SteamProvider } from './index'
import type { SteamLocalDeps } from './local'
import { withFamily } from './session'

const KEY = '0123456789ABCDEF0123456789ABCDEF'
const STEAM_ID = '76561198000000001'
const NOW = new Date('2026-09-25T20:00:00.000Z')
const HOUR = 60 * 60_000
const REFRESH = new Secret(`${STEAM_ID}%7C%7Cfake.refresh.token`)
const KEY_ONLY: AccountCredentials = {
  platform: 'steam',
  externalId: STEAM_ID,
  secret: new Secret(KEY),
}
const WITH_FAMILY: AccountCredentials = {
  ...KEY_ONLY,
  secret: withFamily(new Secret(KEY), REFRESH),
}
const NO_ACHIEVEMENTS = ['10', '70', '80', '100', '320', '360']
const DELISTED = ['43160', '553850', '596870']

const NO_LOCAL: SteamLocalDeps = {
  readRegistry: () => Promise.resolve(null),
  watchFolder: () => () => undefined,
}

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/steam', name), 'utf8')
}

const fetchMock = vi.fn<typeof fetch>()
let now = NOW
let familyExpired = false
let issued = 0

function json(body: string, setCookies: readonly string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  for (const line of setCookies) headers.append('Set-Cookie', line)
  return new Response(body, { status: 200, headers })
}

function session(): Response {
  issued += 1
  const exp = Math.floor(now.getTime() / 1000) + 24 * 3600
  const jwt = `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.sig-${issued}`
  return json('', [`steamLoginSecure=${STEAM_ID}%7C%7C${jwt}; Path=/`])
}

function answer(url: URL): Response {
  switch (url.pathname) {
    case '/jwt/ajaxrefresh':
      return json(
        fixture(familyExpired ? 'family-refresh-expired.json' : 'family-refresh-ticket.json'),
      )
    case '/login/settoken':
      return session()
    case '/ISteamUser/GetPlayerSummaries/v2/':
      return json(fixture('player-summaries.json'))
    case '/IPlayerService/GetOwnedGames/v1/':
      return json(fixture('owned-games.json'))
    case '/IPlayerService/GetRecentlyPlayedGames/v1/':
      return json(fixture('recently-played.json'))
    case '/IFamilyGroupsService/GetFamilyGroupForUser/v1/':
      return json(fixture('family-group.json'))
    case '/IFamilyGroupsService/GetSharedLibraryApps/v1/':
      return json(fixture('family-shared-library.json'))
    case '/IStoreBrowseService/GetItems/v1/':
      return json(fixture('family-store-items.json'))
    case '/ISteamUserStats/GetSchemaForGame/v2/':
      return json(fixture('schema-883710.json'))
    default:
      throw new Error(`unexpected request to ${url.href}`)
  }
}

beforeEach(() => {
  now = NOW
  familyExpired = false
  issued = 0
  fetchMock.mockImplementation((input) => Promise.resolve(answer(new URL(String(input)))))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function provider(): SteamProvider {
  return new SteamProvider(NO_LOCAL, { now: () => now })
}

function requestsTo(pathname: string): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === pathname)
}

async function baseIds(): Promise<Set<string>> {
  const games = await provider().listGames(KEY_ONLY)
  fetchMock.mockClear()
  return new Set(games.map((game) => game.ref.externalId))
}

describe('SteamProvider and the family library', () => {
  it('makes no family requests for an account without the family sign-in', async () => {
    await provider().listGames(KEY_ONLY)

    expect(requestsTo('/jwt/ajaxrefresh')).toEqual([])
    expect(requestsTo('/IFamilyGroupsService/GetSharedLibraryApps/v1/')).toEqual([])
  })

  it('adds the family games that have achievements, once each', async () => {
    const base = await baseIds()

    const games = await provider().listGames(WITH_FAMILY)
    const added = games.filter((game) => !base.has(game.ref.externalId))
    const ids = added.map((game) => game.ref.externalId)

    expect(ids).toContain('220')
    expect(ids).toEqual(expect.arrayContaining(DELISTED))
    expect(ids.some((id) => NO_ACHIEVEMENTS.includes(id))).toBe(false)
    expect(new Set(games.map((game) => game.ref.externalId)).size).toBe(games.length)
    expect(added.find((game) => game.ref.externalId === '220')).toMatchObject({
      title: 'Half-Life 2',
      lastPlayed: null,
      recentlyPlayed: false,
    })
  })

  it('asks the schema only about games the store has no page for', async () => {
    await provider().listGames(WITH_FAMILY)

    const asked = requestsTo('/ISteamUserStats/GetSchemaForGame/v2/').map((url) =>
      url.searchParams.get('appid'),
    )
    expect(asked.sort()).toEqual([...DELISTED].sort())
    expect(requestsTo('/ISteamUserStats/GetSchemaForGame/v2/')[0]?.searchParams.get('key')).toBe(
      KEY,
    )
  })

  it('reuses the session and what it learnt about achievements on the next look', async () => {
    const steam = provider()
    await steam.listGames(WITH_FAMILY)
    fetchMock.mockClear()

    await steam.listGames(WITH_FAMILY)

    expect(requestsTo('/jwt/ajaxrefresh')).toEqual([])
    expect(requestsTo('/IStoreBrowseService/GetItems/v1/')).toEqual([])
    expect(requestsTo('/IFamilyGroupsService/GetSharedLibraryApps/v1/')).toHaveLength(1)
    expect(
      requestsTo('/IFamilyGroupsService/GetSharedLibraryApps/v1/')[0]?.searchParams.get(
        'access_token',
      ),
    ).toMatch(/sig-1$/)
  })

  it('gets a new session an hour before the old one expires', async () => {
    const steam = provider()
    await steam.listGames(WITH_FAMILY)

    now = new Date(NOW.getTime() + 22.9 * HOUR)
    await steam.listGames(WITH_FAMILY)
    expect(requestsTo('/login/settoken')).toHaveLength(1)

    now = new Date(NOW.getTime() + 23.1 * HOUR)
    await steam.listGames(WITH_FAMILY)
    expect(requestsTo('/login/settoken')).toHaveLength(2)
  })

  it('keeps the rest of Steam working when the family sign-in has expired, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    familyExpired = true
    const base = await baseIds()

    const games = await provider().listGames(WITH_FAMILY)

    expect(new Set(games.map((game) => game.ref.externalId))).toEqual(base)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('left out the family library'))
  })

  it('tries the family sign-in again on the next look after a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const steam = provider()
    familyExpired = true
    await steam.listGames(WITH_FAMILY)

    familyExpired = false
    const games = await steam.listGames(WITH_FAMILY)

    expect(games.some((game) => game.ref.externalId === '220')).toBe(true)
  })

  it('uses the key from a secret that also holds the family sign-in', async () => {
    await provider().validate(WITH_FAMILY)

    const [summary] = fetchMock.mock.calls.map(([input]) => new URL(String(input)))
    expect(summary?.searchParams.get('key')).toBe(KEY)
  })
})
