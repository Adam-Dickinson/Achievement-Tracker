import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type { AccountCredentials } from '@shared/models'
import { Secret } from '@shared/secret'
import { applyMigrations } from '../../store/migrate'
import { addPlatformGames, upsertAccount } from '../../store/sync-store'
import { runSyncPass } from '../../sync/sync-pass'
import { EpicProvider } from './index'

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef'
const NOW = new Date('2026-09-25T15:00:00.000Z')
const HOUR = 60 * 60_000
const ROCKET_LEAGUE = '9773aa1aa54f4f7b80e44bef04986cea'
const RHYTHM_CASTLE = '048550a9623d4824894430a2c2823e02'
const JEDI = 'e509c16d53714b13ba8e393966507255'

const TOKEN_URL = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token'
const LIBRARY = 'https://library-service.live.use1a.on.epicgames.com/library/api/public'
const CATALOG =
  'https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace'
const GRAPHQL = 'https://launcher.store.epicgames.com/graphql'

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/epic', name), 'utf8')
}

interface GraphqlBody {
  readonly query: string
  readonly variables: Record<string, string>
}

const fetchMock = vi.fn<typeof fetch>()
let libraryStatus = 200
let playtime = fixture('playtime.json')
let now = NOW

function json(body: string, status = 200): Response {
  return new Response(body, { status })
}

function schemaFor(sandbox: string): string {
  return [ROCKET_LEAGUE, RHYTHM_CASTLE].includes(sandbox)
    ? fixture(`schema-${sandbox}.json`)
    : sandbox === JEDI
      ? fixture(`schema-${RHYTHM_CASTLE}.json`)
      : fixture('schema-none.json')
}

function catalogFor(sandbox: string): string {
  return [ROCKET_LEAGUE, RHYTHM_CASTLE, JEDI].includes(sandbox)
    ? fixture(`catalog-${sandbox}.json`)
    : fixture('catalog-empty.json')
}

function answer(url: URL, init: RequestInit | undefined): Response {
  const href = url.toString()
  if (href === TOKEN_URL) return json(fixture('token.json'))
  if (href.startsWith(`${LIBRARY}/items`)) {
    if (libraryStatus !== 200) return json(fixture('err-library-bad-token.json'), libraryStatus)
    return json(
      fixture(url.searchParams.get('cursor') ? 'library-page2.json' : 'library-page1.json'),
    )
  }
  if (href.startsWith(`${LIBRARY}/playtime/account/${ACCOUNT_ID}/all`)) return json(playtime)
  if (href.startsWith(CATALOG)) return json(catalogFor(url.pathname.split('/')[5] ?? ''))
  if (href === GRAPHQL) {
    const body = JSON.parse(String(init?.body)) as GraphqlBody
    if (body.query.includes('PlayerAchievement')) {
      return json(
        body.variables['sandboxId'] === ROCKET_LEAGUE
          ? fixture(`player-${ROCKET_LEAGUE}.json`)
          : fixture('player-none.json'),
      )
    }
    return json(schemaFor(body.variables['SandboxId'] ?? ''))
  }
  throw new Error(`unexpected request to ${href}`)
}

beforeEach(() => {
  now = NOW
  libraryStatus = 200
  playtime = fixture('playtime.json')
  fetchMock.mockImplementation((input, init) =>
    Promise.resolve(answer(new URL(String(input)), init)),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function provider(): EpicProvider {
  return new EpicProvider({ now: () => now })
}

function stored(token = 'eg1~stored-refresh-token'): AccountCredentials {
  return { platform: 'epic', externalId: ACCOUNT_ID, secret: new Secret(token) }
}

function requests(prefix: string): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).startsWith(prefix)).length
}

function graphqlCalls(): { body: GraphqlBody; headers: Record<string, string> }[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input) === GRAPHQL)
    .map(([, init]) => ({
      body: JSON.parse(String(init?.body)) as GraphqlBody,
      headers: init?.headers as Record<string, string>,
    }))
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('EpicProvider', () => {
  it('declares an unofficial, polled source with global rarity and a browser sign-in', () => {
    expect(provider().platform).toBe('epic')
    expect(provider().capabilities).toEqual({
      localWatch: false,
      polling: true,
      globalRarity: true,
      oauth: true,
      unofficial: true,
    })
  })

  describe('authenticate and validate', () => {
    it('turns the pasted code into credentials keyed by the Epic account ID', async () => {
      const epic = provider()

      const credentials = await epic.authenticate({
        kind: 'token',
        value: new Secret('0123456789abcdef0123456789abcdef'),
      })

      expect(credentials.platform).toBe('epic')
      expect(credentials.externalId).toBe(ACCOUNT_ID)
      expect(credentials.secret?.expose()).toBe('eg1~fake-refresh-token')
      expect(await epic.validate(credentials)).toEqual({
        externalId: ACCOUNT_ID,
        displayName: 'TestPlayer',
      })
      expect(requests(TOKEN_URL)).toBe(1)
    })

    it('refuses any other kind of sign-in', async () => {
      const error = await errorFrom(
        provider().authenticate({ kind: 'api_key', key: new Secret('k'), accountId: 'a' }),
      )

      expect(error.kind).toBe('unsupported')
    })

    it('names the account "Epic account" when Epic gives no display name', async () => {
      const token = { ...JSON.parse(fixture('token.json')), displayName: null }
      fetchMock.mockImplementation((input, init) =>
        Promise.resolve(
          String(input) === TOKEN_URL
            ? json(JSON.stringify(token))
            : answer(new URL(String(input)), init),
        ),
      )

      expect((await provider().validate(stored())).displayName).toBe('Epic account')
    })
  })

  describe('refresh', () => {
    it('signs in with the stored refresh token and hands back the rotated one', async () => {
      const refreshed = await provider().refresh(stored())

      const form = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams
      expect(form.get('refresh_token')).toBe('eg1~stored-refresh-token')
      expect(refreshed.secret?.expose()).toBe('eg1~fake-refresh-token')
    })

    it('keeps the session until 30 minutes before it expires, then refreshes with the newest token', async () => {
      const epic = provider()
      await epic.refresh(stored())

      now = new Date(NOW.getTime() + 35 * HOUR)
      await epic.refresh(stored())
      expect(requests(TOKEN_URL)).toBe(1)

      now = new Date(NOW.getTime() + 35.6 * HOUR)
      await epic.refresh(stored())
      expect(requests(TOKEN_URL)).toBe(2)
      const form = fetchMock.mock.calls.at(-1)?.[1]?.body as URLSearchParams
      expect(form.get('refresh_token')).toBe('eg1~fake-refresh-token')
    })

    it('refuses a saved sign-in that belongs to another Epic account', async () => {
      const other = { ...stored(), externalId: 'ffffffffffffffffffffffffffffffff' }

      expect((await errorFrom(provider().refresh(other))).kind).toBe('other')
    })

    it('reports an account with no stored sign-in as expired', async () => {
      const error = await errorFrom(provider().refresh({ ...stored(), secret: null }))

      expect(error.kind).toBe('auth_expired')
    })
  })

  describe('listGames', () => {
    it('lists only the games with Epic achievements, with catalog titles and resized covers', async () => {
      const games = await provider().listGames(stored())

      expect(games.map((game) => [game.ref.externalId, game.title])).toEqual([
        [ROCKET_LEAGUE, 'Rocket League®'],
        [RHYTHM_CASTLE, 'SUPER CRAZY RHYTHM CASTLE'],
        [JEDI, 'Star Wars: Jedi Fallen Order'],
      ])
      expect(games[0]).toMatchObject({
        iconUrl: null,
        lastPlayed: null,
        coverUrl: expect.stringMatching(/^https:\/\/cdn1\.epicgames\.com\/.+\?resize=1&w=920$/),
      })
      expect(requests(`${LIBRARY}/items`)).toBe(2)
    })

    it('asks the catalog only about games that have achievements', async () => {
      await provider().listGames(stored())

      expect(requests(CATALOG)).toBe(3)
    })

    it("falls back to the library's name when the catalog has nothing", async () => {
      fetchMock.mockImplementation((input, init) => {
        const url = new URL(String(input))
        return Promise.resolve(url.toString().startsWith(CATALOG) ? json('{}') : answer(url, init))
      })

      const games = await provider().listGames(stored())

      expect(games.map((game) => game.title)).toEqual([
        'Rocket League®',
        'Live',
        'Star Wars Jedi Fallen Order',
      ])
      expect(games.every((game) => game.coverUrl === null)).toBe(true)
    })

    it('counts a game as recently played on the first look if it has any playtime', async () => {
      const games = await provider().listGames(stored())

      expect(games.map((game) => game.recentlyPlayed)).toEqual([true, false, true])
    })

    it('then counts only the games whose playtime has grown', async () => {
      const epic = provider()
      await epic.listGames(stored())

      playtime = JSON.stringify(
        JSON.parse(fixture('playtime.json')).map((p: { artifactId: string; totalTime: number }) =>
          p.artifactId === 'shoebill' ? { ...p, totalTime: p.totalTime + 600 } : p,
        ),
      )
      const games = await epic.listGames(stored())

      expect(games.map((game) => game.recentlyPlayed)).toEqual([false, false, true])
    })

    it('remembers which games have achievements for a day', async () => {
      const epic = provider()
      await epic.listGames(stored())
      const afterFirst = graphqlCalls().length

      now = new Date(NOW.getTime() + 23 * HOUR)
      await epic.listGames(stored())
      expect(graphqlCalls().length).toBe(afterFirst)

      now = new Date(NOW.getTime() + 25 * HOUR)
      await epic.listGames(stored())
      expect(graphqlCalls().length).toBe(afterFirst * 2)
    })

    it('asks about achievements without a token', async () => {
      await provider().listGames(stored())

      expect(graphqlCalls().every((call) => !('Authorization' in call.headers))).toBe(true)
    })

    it('signs in again and retries once when the library rejects the token', async () => {
      const epic = provider()
      await epic.refresh(stored())
      libraryStatus = 401
      fetchMock.mockImplementation((input, init) => {
        const url = new URL(String(input))
        const response = answer(url, init)
        if (url.toString().startsWith(`${LIBRARY}/items`)) libraryStatus = 200
        return Promise.resolve(response)
      })

      const games = await epic.listGames(stored())

      expect(games).toHaveLength(3)
      expect(requests(TOKEN_URL)).toBe(2)
    })
  })

  describe('fetchGame', () => {
    it('merges the achievements (asked without a token) with your unlocks (asked with one)', async () => {
      const game = await provider().fetchGame(stored(), { externalId: ROCKET_LEAGUE })

      expect(game.achievements.map((a) => a.externalId)).toEqual(['0', '1', '10', '11', '15'])
      expect(game.unlocks.map((u) => [u.achievementExternalId, u.unlockedAt])).toEqual([
        ['1', new Date('2025-05-02T18:03:41.722Z')],
        ['10', new Date('2023-07-05T21:05:39.306Z')],
        ['11', new Date('2025-02-25T21:25:48.359Z')],
      ])

      const [schema, player] = graphqlCalls()
      expect(schema?.body.variables).toEqual({ SandboxId: ROCKET_LEAGUE, Locale: 'en-US' })
      expect(schema?.headers).not.toHaveProperty('Authorization')
      expect(player?.body.variables).toEqual({
        epicAccountId: ACCOUNT_ID,
        sandboxId: ROCKET_LEAGUE,
      })
      expect(player?.headers).toMatchObject({ Authorization: 'bearer eg1~fake-access-token' })
    })

    it('returns no unlocks for a game never played', async () => {
      const game = await provider().fetchGame(stored(), { externalId: RHYTHM_CASTLE })

      expect(game.achievements).toHaveLength(2)
      expect(game.unlocks).toEqual([])
    })
  })

  it('keeps a first sync silent, then announces a new unlock once (baseline rule)', async () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const epic = provider()
    const account = upsertAccount(db, {
      platform: 'epic',
      externalId: ACCOUNT_ID,
      displayName: 'TestPlayer',
    })
    addPlatformGames(db, account, await epic.listGames(stored()))

    expect(await runSyncPass(db, account, ROCKET_LEAGUE, epic, stored())).toEqual([])

    const player = JSON.parse(fixture(`player-${ROCKET_LEAGUE}.json`))
    player.data.PlayerAchievement.playerAchievementGameRecordsBySandbox.records[0].playerAchievements.push(
      {
        playerAchievement: {
          achievementName: '15',
          unlocked: true,
          progress: 1,
          unlockDate: '2026-09-25T15:30:00.000Z',
          XP: 15,
        },
      },
    )
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input))
      const body =
        url.toString() === GRAPHQL ? (JSON.parse(String(init?.body)) as GraphqlBody) : null
      return Promise.resolve(
        body?.query.includes('PlayerAchievement')
          ? json(JSON.stringify(player))
          : answer(url, init),
      )
    })

    const events = await runSyncPass(db, account, ROCKET_LEAGUE, epic, stored())
    expect(events.map((event) => [event.gameTitle, event.achievement.name])).toEqual([
      ['Rocket League®', 'Drill Sergeant'],
    ])
    expect(await runSyncPass(db, account, ROCKET_LEAGUE, epic, stored())).toEqual([])
  })
})
