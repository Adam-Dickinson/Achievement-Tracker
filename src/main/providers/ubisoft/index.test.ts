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
import { UbisoftProvider } from './index'

const USER_ID = '00000000-0000-4000-8000-0000000000aa'
const NOW = new Date('2026-09-25T17:00:00.000Z')
const HOUR = 60 * 60_000
const VALHALLA = 'c4f15d67-1300-4e9e-bbe3-12e11a148e81'
const FAR_CRY_5 = 'f40e304d-8e8d-4343-8270-d06487c35add'

const SESSIONS_URL = 'https://public-ubiservices.ubi.com/v3/profiles/sessions'
const GRAPHQL_URL = 'https://public-ubiservices.ubi.com/v1/profiles/me/uplay/graphql'

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/ubisoft', name), 'utf8')
}

interface GraphqlBody {
  readonly query: string
  readonly variables: Record<string, string>
}

const fetchMock = vi.fn<typeof fetch>()
let now = NOW
let issued = 0
let ticketRejected = false

function json(body: string, status = 200): Response {
  return new Response(body, { status })
}

function session(): string {
  issued += 1
  return JSON.stringify({
    ...JSON.parse(fixture('session.json')),
    ticket: `fake-ticket-${issued}`,
    rememberMeTicket: `fake-remember-me-${issued}`,
  })
}

function answer(url: string, init: RequestInit | undefined): Response {
  if (url === SESSIONS_URL) return json(session())
  if (url === GRAPHQL_URL) {
    if (ticketRejected) return json(fixture('err-bad-ticket.json'), 401)
    const body = JSON.parse(String(init?.body)) as GraphqlBody
    if (body.query.includes('UbisoftGames')) return json(fixture('games.json'))
    const spaceId = body.variables['spaceId']
    if (spaceId === VALHALLA) return json(fixture('achievements-valhalla.json'))
    if (spaceId === FAR_CRY_5) return json(fixture('achievements-farcry5.json'))
    return json('{"data":{"game":null}}')
  }
  throw new Error(`unexpected request to ${url}`)
}

beforeEach(() => {
  now = NOW
  issued = 0
  ticketRejected = false
  fetchMock.mockImplementation((input, init) => Promise.resolve(answer(String(input), init)))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function provider(): UbisoftProvider {
  return new UbisoftProvider({ now: () => now })
}

function stored(ticket = 'stored-remember-me'): AccountCredentials {
  return { platform: 'ubisoft', externalId: USER_ID, secret: new Secret(ticket) }
}

function sessionRequests(): string[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input) === SESSIONS_URL)
    .map(([, init]) => (init?.headers as Record<string, string>)['Authorization'] ?? '')
}

function graphqlCalls(): { body: GraphqlBody; headers: Record<string, string> }[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input) === GRAPHQL_URL)
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

describe('UbisoftProvider', () => {
  it('declares an unofficial, polled source without rarity and with a sign-in window', () => {
    expect(provider().platform).toBe('ubisoft')
    expect(provider().capabilities).toEqual({
      localWatch: false,
      polling: true,
      globalRarity: false,
      oauth: true,
      unofficial: true,
    })
  })

  describe('authenticate and validate', () => {
    it("trades the sign-in window's remember-me ticket for credentials keyed by the Ubisoft user ID", async () => {
      const ubisoft = provider()

      const credentials = await ubisoft.authenticate({
        kind: 'token',
        value: new Secret('from-sign-in-window'),
      })

      expect(credentials.platform).toBe('ubisoft')
      expect(credentials.externalId).toBe(USER_ID)
      expect(credentials.secret?.expose()).toBe('fake-remember-me-1')
      expect(sessionRequests()).toEqual(['rm_v1 t=from-sign-in-window'])
      expect(await ubisoft.validate(credentials)).toEqual({
        externalId: USER_ID,
        displayName: 'TestPlayer',
      })
      expect(sessionRequests()).toHaveLength(1)
    })

    it('refuses any other kind of sign-in', async () => {
      const error = await errorFrom(
        provider().authenticate({ kind: 'api_key', key: new Secret('k'), accountId: 'a' }),
      )

      expect(error.kind).toBe('unsupported')
    })

    it('names the account "Ubisoft account" when Ubisoft gives no name', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          json(JSON.stringify({ ...JSON.parse(fixture('session.json')), nameOnPlatform: null })),
        ),
      )
      const ubisoft = provider()

      const credentials = await ubisoft.authenticate({ kind: 'token', value: new Secret('t') })

      expect((await ubisoft.validate(credentials)).displayName).toBe('Ubisoft account')
    })
  })

  describe('refresh', () => {
    it('renews the session with the stored remember-me ticket and hands back the rotated one', async () => {
      const refreshed = await provider().refresh(stored())

      expect(sessionRequests()).toEqual(['rm_v1 t=stored-remember-me'])
      expect(refreshed.secret?.expose()).toBe('fake-remember-me-1')
    })

    it('keeps the session until 30 minutes before it expires, then renews with the newest ticket', async () => {
      const ubisoft = provider()
      await ubisoft.refresh(stored())

      now = new Date(NOW.getTime() + 2.4 * HOUR)
      expect((await ubisoft.refresh(stored())).secret?.expose()).toBe('fake-remember-me-1')
      expect(sessionRequests()).toHaveLength(1)

      now = new Date(NOW.getTime() + 2.6 * HOUR)
      expect((await ubisoft.refresh(stored())).secret?.expose()).toBe('fake-remember-me-2')
      expect(sessionRequests()).toEqual([
        'rm_v1 t=stored-remember-me',
        'rm_v1 t=fake-remember-me-1',
      ])
    })

    it('renews only once when asked twice at the same time, because Ubisoft revokes a reused ticket', async () => {
      const ubisoft = provider()

      const [first, second] = await Promise.all([
        ubisoft.refresh(stored()),
        ubisoft.refresh(stored()),
      ])

      expect(sessionRequests()).toHaveLength(1)
      expect(first.secret?.expose()).toBe('fake-remember-me-1')
      expect(second.secret?.expose()).toBe('fake-remember-me-1')
    })

    it('tries again after a failed renewal', async () => {
      const ubisoft = provider()
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

      expect((await errorFrom(ubisoft.refresh(stored()))).kind).toBe('network')
      expect((await ubisoft.refresh(stored())).secret?.expose()).toBe('fake-remember-me-1')
    })

    it('reports a remember-me ticket Ubisoft has revoked as an expired sign-in', async () => {
      fetchMock.mockResolvedValue(json(fixture('err-session-expired.json'), 401))

      expect((await errorFrom(provider().refresh(stored()))).kind).toBe('auth_expired')
    })

    it('refuses a saved sign-in that belongs to another Ubisoft account', async () => {
      const other = { ...stored(), externalId: 'ffffffff-0000-4000-8000-000000000000' }

      expect((await errorFrom(provider().refresh(other))).kind).toBe('other')
    })

    it('reports an account with no stored sign-in as expired', async () => {
      const error = await errorFrom(provider().refresh({ ...stored(), secret: null }))

      expect(error.kind).toBe('auth_expired')
    })
  })

  describe('listGames', () => {
    it('lists the games that have achievements in one query, as the launcher', async () => {
      const ubisoft = provider()
      await ubisoft.refresh(stored())

      const games = await ubisoft.listGames(stored())

      expect(games).toHaveLength(10)
      expect(games[0]).toMatchObject({
        title: "Tom Clancy's Rainbow Six® Siege",
        recentlyPlayed: true,
      })
      const [call] = graphqlCalls()
      expect(graphqlCalls()).toHaveLength(1)
      expect(call?.headers).toMatchObject({ Authorization: 'Ubi_v1 t=fake-ticket-1' })
    })

    it('never renews the session itself, so a rotated ticket is always one the scheduler saves', async () => {
      const error = await errorFrom(provider().listGames(stored()))

      expect(error.kind).toBe('network')
      expect(error.isRetryable).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('drops a session Ubisoft rejects and asks to retry; the next refresh renews it', async () => {
      const ubisoft = provider()
      await ubisoft.refresh(stored())
      ticketRejected = true

      const error = await errorFrom(ubisoft.listGames(stored()))
      expect(error.kind).toBe('network')
      expect(sessionRequests()).toHaveLength(1)

      ticketRejected = false
      expect((await ubisoft.refresh(stored())).secret?.expose()).toBe('fake-remember-me-2')
      expect(await ubisoft.listGames(stored())).toHaveLength(10)
    })

    it('asks for a renewal once the session is within 30 minutes of expiring', async () => {
      const ubisoft = provider()
      await ubisoft.refresh(stored())

      now = new Date(NOW.getTime() + 2.6 * HOUR)

      expect((await errorFrom(ubisoft.listGames(stored()))).isRetryable).toBe(true)
      expect(fetchMock.mock.calls.filter(([input]) => String(input) === GRAPHQL_URL)).toHaveLength(
        0,
      )
    })
  })

  describe('fetchGame', () => {
    it("reads a game's achievements and your unlocks in one query", async () => {
      const ubisoft = provider()
      await ubisoft.refresh(stored())

      const game = await ubisoft.fetchGame(stored(), { externalId: VALHALLA })

      expect(game.achievements).toHaveLength(92)
      expect(game.unlocks).toHaveLength(4)
      expect(graphqlCalls()[0]?.body.variables).toEqual({ spaceId: VALHALLA })
    })

    it('returns nothing for a game Ubisoft does not know', async () => {
      const ubisoft = provider()
      await ubisoft.refresh(stored())

      expect(await ubisoft.fetchGame(stored(), { externalId: 'unknown' })).toEqual({
        achievements: [],
        unlocks: [],
      })
    })
  })

  it('keeps a first sync silent, then announces a new unlock once (baseline rule)', async () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const ubisoft = provider()
    await ubisoft.refresh(stored())
    const account = upsertAccount(db, {
      platform: 'ubisoft',
      externalId: USER_ID,
      displayName: 'TestPlayer',
    })
    addPlatformGames(db, account, await ubisoft.listGames(stored()))

    expect(await runSyncPass(db, account, FAR_CRY_5, ubisoft, stored())).toEqual([])

    const farCry = JSON.parse(fixture('achievements-farcry5.json'))
    const locked = farCry.data.game.viewer.meta.achievements.nodes.find(
      (node: { viewer: { meta: { isCompleted: boolean } } }) => !node.viewer.meta.isCompleted,
    )
    locked.viewer.meta = {
      ...locked.viewer.meta,
      isCompleted: true,
      completionDate: '2026-09-25T17:30:00',
    }
    fetchMock.mockImplementation((input, init) => {
      const body =
        String(input) === GRAPHQL_URL ? (JSON.parse(String(init?.body)) as GraphqlBody) : null
      return Promise.resolve(
        body?.variables['spaceId'] === FAR_CRY_5
          ? json(JSON.stringify(farCry))
          : answer(String(input), init),
      )
    })

    const events = await runSyncPass(db, account, FAR_CRY_5, ubisoft, stored())
    expect(events.map((event) => [event.gameTitle, event.achievement.name])).toEqual([
      ['Far Cry® 5', locked.title],
    ])
    expect(events[0]?.unlockedAt).toEqual(new Date('2026-09-25T17:30:00Z'))
    expect(await runSyncPass(db, account, FAR_CRY_5, ubisoft, stored())).toEqual([])
  })
})
