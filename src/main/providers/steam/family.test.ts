import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { fetchFamilyApps, fetchStoreAchievementFlags, toFamilyGame } from './family'

const STEAM_ID = '76561198000000001'

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

function json(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

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

  it("builds a library game with Steam's icon, leaving the cover to the provider", () => {
    const game = toFamilyGame(
      { appid: '220', name: 'Half-Life 2', iconHash: 'abc', lastPlayed: null },
      now,
    )

    expect(game).toEqual({
      ref: { externalId: '220' },
      title: 'Half-Life 2',
      iconUrl: 'https://media.steampowered.com/steamcommunity/public/images/apps/220/abc.jpg',
      coverUrl: null,
      lastPlayed: null,
      recentlyPlayed: false,
      storeUrl: 'steam://nav/games/details/220',
    })
  })

  it('marks a game played in the last two weeks as recent', () => {
    const played = new Date('2026-09-04T00:00:00.000Z')

    expect(
      toFamilyGame({ appid: '1', name: 'x', iconHash: null, lastPlayed: played }, now),
    ).toMatchObject({ iconUrl: null, recentlyPlayed: true })
  })
})
