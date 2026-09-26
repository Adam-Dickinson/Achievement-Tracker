import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type { AccountCredentials, RemoteGameRef } from '@shared/models'
import { Secret } from '@shared/secret'
import { applyMigrations } from '../../store/migrate'
import { getAccount } from '../../store/sync-store'
import { runSyncPass } from '../../sync/sync-pass'
import { SteamProvider } from './index'
import { DEBOUNCE_MS, type SteamLocalDeps } from './local'

const KEY = '0123456789ABCDEF0123456789ABCDEF'
const STEAM_ID = '76561190000000001'
const CREDENTIALS: AccountCredentials = {
  platform: 'steam',
  externalId: STEAM_ID,
  secret: new Secret(KEY),
}

function fixtureText(name: string): string {
  return readFileSync(resolve('tests/fixtures/steam', name), 'utf8')
}

interface FakeReply {
  readonly body: string
  readonly status?: number
  readonly type?: string
}

const DEFAULT_REPLIES: Record<string, FakeReply> = {
  '/ISteamUser/GetPlayerSummaries/v2/': { body: fixtureText('player-summaries.json') },
  '/IPlayerService/GetOwnedGames/v1/': { body: fixtureText('owned-games.json') },
  '/IPlayerService/GetRecentlyPlayedGames/v1/': { body: fixtureText('recently-played.json') },
  '/ISteamUserStats/GetSchemaForGame/v2/': { body: fixtureText('schema-883710.json') },
  '/ISteamUserStats/GetPlayerAchievements/v1/': {
    body: fixtureText('player-achievements-883710.json'),
  },
  '/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/': {
    body: fixtureText('global-pct-883710.json'),
  },
}

let replies: Record<string, FakeReply>
const requests: URL[] = []
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  replies = { ...DEFAULT_REPLIES }
  requests.length = 0
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input))
    requests.push(url)
    const reply = replies[url.pathname]
    if (reply === undefined) return Promise.reject(new Error(`unexpected request ${url.pathname}`))
    return Promise.resolve(
      new Response(reply.body, {
        status: reply.status ?? 200,
        headers: { 'content-type': reply.type ?? 'application/json; charset=UTF-8' },
      }),
    )
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function requestTo(endpoint: string): URL {
  const url = requests.find((request) => request.pathname === endpoint)
  if (url === undefined) throw new Error(`no request to ${endpoint}`)
  return url
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

const provider = new SteamProvider()

describe('SteamProvider', () => {
  it('declares an official, polled source with global rarity and a local watch', () => {
    expect(provider.platform).toBe('steam')
    expect(provider.capabilities).toEqual({
      localWatch: true,
      polling: true,
      globalRarity: true,
      oauth: false,
      unofficial: false,
    })
  })

  describe('watch', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    function watchingProvider(): {
      provider: SteamProvider
      changeFile: (name: string) => void
    } {
      let onFile: (name: string) => void = () => undefined
      const local: SteamLocalDeps = {
        readRegistry: (_key, name) => Promise.resolve(name === 'SteamPath' ? 'C:/Steam' : null),
        watchFolder: (_path, listener) => {
          onFile = listener
          return () => undefined
        },
      }
      return { provider: new SteamProvider(local), changeFile: (name) => onFile(name) }
    }

    it("reports a changed stats file as that game's ref, for this account only", async () => {
      vi.useFakeTimers()
      const { provider: watching, changeFile } = watchingProvider()
      const onChange = vi.fn<(game: RemoteGameRef) => void>()

      const stop = watching.watch({ ...CREDENTIALS, externalId: '76561198000000001' }, onChange)
      await vi.advanceTimersByTimeAsync(0)
      changeFile('UserGameStats_39734273_883710.bin')
      changeFile('UserGameStats_1_440.bin')
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ externalId: '883710' })
      stop()
    })

    it('does nothing for an account without a valid SteamID64', () => {
      const local: SteamLocalDeps = {
        readRegistry: vi.fn<SteamLocalDeps['readRegistry']>(),
        watchFolder: vi.fn<SteamLocalDeps['watchFolder']>(),
      }
      const stop = new SteamProvider(local).watch({ ...CREDENTIALS, externalId: 'x' }, vi.fn())

      expect(local.readRegistry).not.toHaveBeenCalled()
      stop()
    })
  })

  describe('authenticate', () => {
    it('checks the key with Steam and returns credentials holding the trimmed id and key', async () => {
      const credentials = await provider.authenticate({
        kind: 'api_key',
        key: new Secret(` ${KEY} `),
        accountId: ` ${STEAM_ID} `,
      })

      expect(credentials.platform).toBe('steam')
      expect(credentials.externalId).toBe(STEAM_ID)
      expect(credentials.secret?.expose()).toBe(KEY)
      const request = requestTo('/ISteamUser/GetPlayerSummaries/v2/')
      expect(request.searchParams.get('steamids')).toBe(STEAM_ID)
      expect(request.searchParams.get('key')).toBe(KEY)
    })

    it('reports a key Steam rejects as auth_expired', async () => {
      replies['/ISteamUser/GetPlayerSummaries/v2/'] = {
        body: fixtureText('error-bad-key.html'),
        status: 403,
        type: 'text/html; charset=UTF-8',
      }

      const error = await errorFrom(
        provider.authenticate({ kind: 'api_key', key: new Secret(KEY), accountId: STEAM_ID }),
      )

      expect(error.kind).toBe('auth_expired')
    })

    it.each([
      ['too short', '7656119000000000'],
      ['not a SteamID64', '12345678901234567'],
      ['a profile URL', 'https://steamcommunity.com/id/someone'],
    ])('rejects a SteamID that is %s without calling Steam', async (_label, accountId) => {
      const error = await errorFrom(
        provider.authenticate({ kind: 'api_key', key: new Secret(KEY), accountId }),
      )

      expect(error.kind).toBe('other')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it.each([
      ['too short', KEY.slice(1)],
      ['not hexadecimal', 'Z'.repeat(32)],
    ])('rejects a key that is %s without calling Steam', async (_label, key) => {
      const error = await errorFrom(
        provider.authenticate({ kind: 'api_key', key: new Secret(key), accountId: STEAM_ID }),
      )

      expect(error.kind).toBe('other')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('does not support other ways of signing in', async () => {
      const error = await errorFrom(
        provider.authenticate({ kind: 'token', value: new Secret('x') }),
      )

      expect(error.kind).toBe('unsupported')
    })
  })

  it('validate returns the account’s SteamID and display name', async () => {
    await expect(provider.validate(CREDENTIALS)).resolves.toEqual({
      externalId: STEAM_ID,
      displayName: 'Test Player',
    })
  })

  it('listGames returns owned games with achievements plus recently played borrowed ones', async () => {
    const games = await provider.listGames(CREDENTIALS)

    expect(games.map((game) => game.title)).toEqual([
      'Portal',
      'Resident Evil 2',
      'Marvel’s Spider-Man Remastered',
    ])
    expect(
      requestTo('/IPlayerService/GetRecentlyPlayedGames/v1/').searchParams.get('steamid'),
    ).toBe(STEAM_ID)
    const request = requestTo('/IPlayerService/GetOwnedGames/v1/')
    expect(request.searchParams.get('steamid')).toBe(STEAM_ID)
    expect(request.searchParams.get('include_appinfo')).toBe('1')
    expect(request.searchParams.get('include_played_free_games')).toBe('1')
  })

  describe('listGames covers', () => {
    const ASSETS = JSON.stringify({
      response: {
        store_items: [
          {
            id: 400,
            success: 1,
            assets: { asset_url_format: 'steam/apps/400/${FILENAME}?t=1', header: 'h1/header.jpg' },
          },
          { id: 883710, success: 15 },
        ],
      },
    })
    let now = new Date('2026-09-26T12:00:00Z')
    const fresh = (): SteamProvider => new SteamProvider(undefined, { now: () => now })
    const storeRequests = (): number =>
      requests.filter((url) => url.pathname === '/IStoreBrowseService/GetItems/v1/').length

    beforeEach(() => {
      now = new Date('2026-09-26T12:00:00Z')
      replies['/IStoreBrowseService/GetItems/v1/'] = { body: ASSETS }
    })

    it("uses each game's current Steam header image, or none", async () => {
      const games = await fresh().listGames(CREDENTIALS)

      expect(games.find((game) => game.ref.externalId === '400')?.coverUrl).toBe(
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/400/h1/header.jpg?t=1',
      )
      expect(games.find((game) => game.ref.externalId === '883710')?.coverUrl).toBeNull()
    })

    it('asks Steam for images at most once a day', async () => {
      const steam = fresh()
      await steam.listGames(CREDENTIALS)
      await steam.listGames(CREDENTIALS)
      expect(storeRequests()).toBe(1)

      now = new Date(now.getTime() + 25 * 60 * 60_000)
      await steam.listGames(CREDENTIALS)
      expect(storeRequests()).toBe(2)
    })

    it('still lists the games when the image request fails', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      replies['/IStoreBrowseService/GetItems/v1/'] = { body: '{}', status: 503 }

      const games = await fresh().listGames(CREDENTIALS)

      expect(games).toHaveLength(3)
      expect(games.every((game) => game.coverUrl === null)).toBe(true)
      vi.restoreAllMocks()
    })
  })

  describe('fetchGame', () => {
    it('combines the schema, the player’s unlocks and global rarity for one game', async () => {
      const result = await provider.fetchGame(CREDENTIALS, { externalId: '883710' })

      expect(result.achievements).toHaveLength(4)
      expect(result.achievements.find((a) => a.externalId === 'NEW_ACHIEVEMENT_1_7')).toMatchObject(
        { name: 'A Hero Emerges', hidden: false, globalPercent: 52 },
      )
      expect(result.unlocks.map((unlock) => unlock.achievementExternalId)).toEqual([
        'NEW_ACHIEVEMENT_1_1',
        'NEW_ACHIEVEMENT_1_7',
      ])
    })

    it('asks for the right game in English, and sends the key only where it is needed', async () => {
      await provider.fetchGame(CREDENTIALS, { externalId: '883710' })

      const schema = requestTo('/ISteamUserStats/GetSchemaForGame/v2/')
      expect(schema.searchParams.get('appid')).toBe('883710')
      expect(schema.searchParams.get('l')).toBe('english')
      expect(schema.searchParams.get('key')).toBe(KEY)
      const player = requestTo('/ISteamUserStats/GetPlayerAchievements/v1/')
      expect(player.searchParams.get('steamid')).toBe(STEAM_ID)
      expect(player.searchParams.get('appid')).toBe('883710')
      const rarity = requestTo('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/')
      expect(rarity.searchParams.get('gameid')).toBe('883710')
      expect(rarity.searchParams.has('key')).toBe(false)
    })

    it('passes the abort signal to every request', async () => {
      const signal = new AbortController().signal

      await provider.fetchGame(CREDENTIALS, { externalId: '883710' }, signal)

      expect(fetchMock).toHaveBeenCalledTimes(3)
      for (const call of fetchMock.mock.calls) expect(call[1]).toEqual({ signal })
    })

    it('returns nothing for a game without stats', async () => {
      replies['/ISteamUserStats/GetSchemaForGame/v2/'] = {
        body: fixtureText('schema-no-stats.json'),
      }
      replies['/ISteamUserStats/GetPlayerAchievements/v1/'] = {
        body: fixtureText('player-achievements-no-stats.json'),
        status: 400,
      }
      replies['/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/'] = {
        body: fixtureText('global-pct-unknown-app.json'),
        status: 403,
      }

      await expect(provider.fetchGame(CREDENTIALS, { externalId: '6060' })).resolves.toEqual({
        achievements: [],
        unlocks: [],
      })
    })
  })

  it.each([
    ['validate', () => provider.validate({ ...CREDENTIALS, secret: null })],
    ['listGames', () => provider.listGames({ ...CREDENTIALS, secret: null })],
    ['fetchGame', () => provider.fetchGame({ ...CREDENTIALS, secret: null }, { externalId: '1' })],
  ])('%s reports a missing key as auth_expired without calling Steam', async (_label, call) => {
    expect((await errorFrom(call())).kind).toBe('auth_expired')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the baseline rule through a real sync pass', async () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (1, 'steam', '${STEAM_ID}', 'Test Player', 'connected', '2026-01-01')
    `)
    db.exec(`INSERT INTO game (id, title, sort_title) VALUES (1, 'Resident Evil 2', 're2')`)
    db.exec(`
      INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title)
      VALUES (1, 1, 1, 'steam', '883710', 'Resident Evil 2')
    `)
    const account = getAccount(db, 1)

    const first = await runSyncPass(db, account, '883710', provider, CREDENTIALS)

    const player = JSON.parse(fixtureText('player-achievements-883710.json')) as {
      playerstats: { achievements: { apiname: string; achieved: number; unlocktime: number }[] }
    }
    for (const row of player.playerstats.achievements) {
      if (row.apiname === 'NEW_ACHIEVEMENT_1_9')
        Object.assign(row, { achieved: 1, unlocktime: 1_790_000_000 })
    }
    replies['/ISteamUserStats/GetPlayerAchievements/v1/'] = { body: JSON.stringify(player) }
    const second = await runSyncPass(db, getAccount(db, 1), '883710', provider, CREDENTIALS)

    expect(first).toEqual([])
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({
      platform: 'steam',
      gameTitle: 'Resident Evil 2',
      achievement: { externalId: 'NEW_ACHIEVEMENT_1_9', name: 'Broken Umbrella', hidden: true },
    })
  })
})
