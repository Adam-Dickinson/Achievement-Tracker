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
import { EaProvider } from './index'

const ACCOUNT_ID = '1000000000001'
const PERSONA_ID = '1000000002'
const NOW = new Date('2026-09-25T17:00:00.000Z')
const HOUR = 60 * 60_000
const APEX = '193634_194908_50844'
const JEDI = '75158_196485_50844'

const TOKEN_HOST = 'accounts.ea.com'
const GRAPHQL_HOST = 'service-aggregation-layer.juno.ea.com'
const ACHIEVEMENTS_PREFIX = `https://achievements.gameservices.ea.com/achievements/personas/${PERSONA_ID}/`

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/ea', name), 'utf8')
}

const fetchMock = vi.fn<typeof fetch>()
let now = NOW
let issued = 0
let tokenRejected = false
let apexReply = fixture('achievements-apex-legends.json')

function json(body: string, status = 200, setCookies: readonly string[] = []): Response {
  const headers = new Headers()
  for (const line of setCookies) headers.append('Set-Cookie', line)
  return new Response(body, { status, headers })
}

function token(): Response {
  issued += 1
  const body = JSON.stringify({
    ...JSON.parse(fixture('token.json')),
    access_token: `token-${issued}`,
  })
  return json(body, 200, [`sid=sid-${issued}; Path=/`, `remid=remid-${issued}; Path=/`])
}

function answer(url: URL, init: RequestInit | undefined): Response {
  if (url.host === TOKEN_HOST) return token()
  if (url.host === GRAPHQL_HOST) {
    if (tokenRejected) return json(fixture('me-unauthenticated.json'))
    const query = url.searchParams.get('query') ?? ''
    if (query.includes('player')) return json(fixture('me.json'))
    if (query.includes('ownedGameProducts')) return json(fixture('owned.json'))
    if (query.includes('legacyOffers')) return json(fixture('offers-and-recent.json'))
  }
  if (url.href.startsWith(`${ACHIEVEMENTS_PREFIX}${APEX}/`)) return json(apexReply)
  if (url.href.startsWith(`${ACHIEVEMENTS_PREFIX}${JEDI}/`)) {
    return json(fixture('achievements-jedi-fallen-order.json'))
  }
  throw new Error(`unexpected request to ${url.href} with ${JSON.stringify(init?.headers)}`)
}

beforeEach(() => {
  now = NOW
  issued = 0
  tokenRejected = false
  apexReply = fixture('achievements-apex-legends.json')
  fetchMock.mockImplementation((input, init) =>
    Promise.resolve(answer(new URL(String(input)), init)),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function provider(): EaProvider {
  return new EaProvider({ now: () => now })
}

function cookies(sid: string, remid: string): Secret {
  return new Secret(JSON.stringify({ sid, remid, _nx_mpcid: 'mpc' }))
}

function stored(secret: Secret | null = cookies('stored-sid', 'stored-remid')): AccountCredentials {
  return { platform: 'ea', externalId: ACCOUNT_ID, secret }
}

function cookiesIn(credentials: AccountCredentials): unknown {
  return JSON.parse(credentials.secret?.expose() ?? 'null')
}

function tokenRequests(): string[] {
  return fetchMock.mock.calls
    .filter(([input]) => new URL(String(input)).host === TOKEN_HOST)
    .map(([, init]) => (init?.headers as Record<string, string>)['Cookie'] ?? '')
}

function requestsTo(host: string): RequestInit[] {
  return fetchMock.mock.calls
    .filter(([input]) => new URL(String(input)).host === host)
    .map(([, init]) => init ?? {})
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('EaProvider', () => {
  it('declares an unofficial, polled source with rarity and a sign-in window', () => {
    expect(provider().platform).toBe('ea')
    expect(provider().capabilities).toEqual({
      localWatch: false,
      polling: true,
      globalRarity: true,
      oauth: true,
      unofficial: true,
    })
  })

  describe('authenticate and validate', () => {
    it("trades the sign-in window's cookies for credentials keyed by the EA account id", async () => {
      const ea = provider()

      const credentials = await ea.authenticate({
        kind: 'token',
        value: cookies('window-sid', 'window-remid'),
      })

      expect(credentials).toMatchObject({ platform: 'ea', externalId: ACCOUNT_ID })
      expect(cookiesIn(credentials)).toEqual({ sid: 'sid-1', remid: 'remid-1', _nx_mpcid: 'mpc' })
      expect(tokenRequests()).toEqual(['sid=window-sid; remid=window-remid; _nx_mpcid=mpc'])
      expect(await ea.validate(credentials)).toEqual({
        externalId: ACCOUNT_ID,
        displayName: 'TrophyTester',
      })
      expect(tokenRequests()).toHaveLength(1)
    })

    it('refuses any other kind of sign-in', async () => {
      const error = await errorFrom(
        provider().authenticate({ kind: 'api_key', key: new Secret('k'), accountId: 'a' }),
      )

      expect(error.kind).toBe('unsupported')
    })

    it('names the account "EA account" when EA gives no name', async () => {
      const me = {
        data: { me: { player: { pd: ACCOUNT_ID, psd: PERSONA_ID, displayName: null } } },
      }
      fetchMock.mockImplementation((input, init) => {
        const url = new URL(String(input))
        return Promise.resolve(
          url.host === GRAPHQL_HOST ? json(JSON.stringify(me)) : answer(url, init),
        )
      })
      const ea = provider()

      const credentials = await ea.authenticate({ kind: 'token', value: cookies('s', 'r') })

      expect((await ea.validate(credentials)).displayName).toBe('EA account')
    })
  })

  describe('refresh', () => {
    it('gets a token with the stored cookies and hands back the ones EA rotated', async () => {
      const refreshed = await provider().refresh(stored())

      expect(tokenRequests()).toEqual(['sid=stored-sid; remid=stored-remid; _nx_mpcid=mpc'])
      expect(cookiesIn(refreshed)).toEqual({ sid: 'sid-1', remid: 'remid-1', _nx_mpcid: 'mpc' })
    })

    it('keeps the token until 30 minutes before it expires, then renews with the newest cookies', async () => {
      const ea = provider()
      await ea.refresh(stored())

      now = new Date(NOW.getTime() + 3.4 * HOUR)
      expect(cookiesIn(await ea.refresh(stored()))).toMatchObject({ sid: 'sid-1' })
      expect(tokenRequests()).toHaveLength(1)

      now = new Date(NOW.getTime() + 3.6 * HOUR)
      expect(cookiesIn(await ea.refresh(stored()))).toMatchObject({
        sid: 'sid-2',
        remid: 'remid-2',
      })
      expect(tokenRequests()[1]).toBe('sid=sid-1; remid=remid-1; _nx_mpcid=mpc')
    })

    it('asks EA only once when asked twice at the same time, because a used remid is refused', async () => {
      const ea = provider()

      const [first, second] = await Promise.all([ea.refresh(stored()), ea.refresh(stored())])

      expect(tokenRequests()).toHaveLength(1)
      expect(cookiesIn(first)).toEqual(cookiesIn(second))
    })

    it('tries again after a failed request', async () => {
      const ea = provider()
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

      expect((await errorFrom(ea.refresh(stored()))).kind).toBe('network')
      expect(cookiesIn(await ea.refresh(stored()))).toMatchObject({ sid: 'sid-1' })
    })

    it('reports a sign-in EA no longer accepts as expired', async () => {
      fetchMock.mockResolvedValue(json(fixture('token-login-required.json')))

      expect((await errorFrom(provider().refresh(stored()))).kind).toBe('auth_expired')
    })

    it('keeps cookies EA rotated even when the rest of the renewal fails', async () => {
      const ea = provider()
      fetchMock.mockImplementationOnce((input, init) =>
        Promise.resolve(answer(new URL(String(input)), init)),
      )
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

      expect((await errorFrom(ea.refresh(stored()))).kind).toBe('network')

      await ea.refresh(stored())
      expect(tokenRequests()[1]).toBe('sid=sid-1; remid=remid-1; _nx_mpcid=mpc')
    })

    it('refuses a saved sign-in that belongs to another EA account', async () => {
      const other = { ...stored(), externalId: '9999999999999' }

      expect((await errorFrom(provider().refresh(other))).kind).toBe('other')
    })

    it('reports an account with no stored sign-in as expired', async () => {
      expect((await errorFrom(provider().refresh(stored(null)))).kind).toBe('auth_expired')
    })
  })

  describe('listGames', () => {
    it('lists the games that have achievements with two queries and the bearer token', async () => {
      const ea = provider()
      await ea.refresh(stored())

      const games = await ea.listGames(stored())

      expect(games).toHaveLength(12)
      expect(games[0]).toMatchObject({
        title: 'skate.™',
        ref: { externalId: '68489_16382151_50844' },
      })
      const graphql = requestsTo(GRAPHQL_HOST)
      expect(graphql).toHaveLength(3)
      expect(graphql[2]?.headers).toMatchObject({ Authorization: 'Bearer token-1' })
    })

    it('never renews the token itself, so rotated cookies are always ones the scheduler saves', async () => {
      const error = await errorFrom(provider().listGames(stored()))

      expect(error.kind).toBe('network')
      expect(error.isRetryable).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('drops a token EA rejects and asks to retry; the next refresh renews it', async () => {
      const ea = provider()
      await ea.refresh(stored())
      tokenRejected = true

      expect((await errorFrom(ea.listGames(stored()))).kind).toBe('network')
      expect(tokenRequests()).toHaveLength(1)

      tokenRejected = false
      expect(cookiesIn(await ea.refresh(stored()))).toMatchObject({ sid: 'sid-2' })
      expect(await ea.listGames(stored())).toHaveLength(12)
    })
  })

  describe('fetchGame', () => {
    it("reads a set's achievements for the account's persona", async () => {
      const ea = provider()
      await ea.refresh(stored())

      const game = await ea.fetchGame(stored(), { externalId: JEDI })

      expect(game.achievements).toHaveLength(39)
      expect(game.unlocks).toHaveLength(19)
    })
  })

  it('keeps a first sync silent, then announces a new unlock once (baseline rule)', async () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const ea = provider()
    await ea.refresh(stored())
    const account = upsertAccount(db, {
      platform: 'ea',
      externalId: ACCOUNT_ID,
      displayName: 'TrophyTester',
    })
    addPlatformGames(db, account, await ea.listGames(stored()))

    expect(await runSyncPass(db, account, APEX, ea, stored())).toEqual([])

    const apex = JSON.parse(apexReply) as Record<
      string,
      { complete: boolean; name: string; u: number; state: object }
    >
    const [lockedId, locked] =
      Object.entries(apex).find(([, achievement]) => !achievement.complete) ?? []
    if (!lockedId || !locked) throw new Error('fixture has no locked achievement')
    const unlockedAt = Math.floor(new Date('2026-09-25T17:30:00Z').getTime() / 1000)
    apex[lockedId] = {
      ...locked,
      complete: true,
      u: unlockedAt,
      state: { a_st: 'COMPLETED', st_ct: unlockedAt },
    }
    apexReply = JSON.stringify(apex)

    const events = await runSyncPass(db, account, APEX, ea, stored())
    expect(events.map((event) => [event.gameTitle, event.achievement.name])).toEqual([
      ['Apex Legends', locked.name],
    ])
    expect(events[0]?.unlockedAt).toEqual(new Date('2026-09-25T17:30:00Z'))
    expect(await runSyncPass(db, account, APEX, ea, stored())).toEqual([])
  })
})
