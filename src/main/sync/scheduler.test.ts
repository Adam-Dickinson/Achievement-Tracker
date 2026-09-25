import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type {
  RemoteAchievement,
  RemoteGame,
  RemoteGameAchievements,
  RemoteGameRef,
  UnlockEvent,
} from '@shared/models'
import type { Platform } from '@shared/platform'
import type { AchievementProvider } from '@shared/provider'
import { Secret } from '@shared/secret'
import { InMemorySecretStore, type SecretStore } from '@shared/secret-store'
import { applyMigrations } from '../store/migrate'
import {
  getPlatformGameByExternalId,
  getSyncState,
  listPlatformGameExternalIds,
  upsertSyncState,
} from '../store/sync-store'
import { IDLE_INTERVAL_MS, LIBRARY_SCOPE, READY, Scheduler, SYNC_INTERVAL_MS } from './scheduler'

const START = new Date('2026-03-01T12:00:00.000Z')
const SECONDS = 1000

function achievement(externalId: string): RemoteAchievement {
  return {
    externalId,
    name: `Achievement ${externalId}`,
    description: null,
    iconUrl: null,
    iconLockedUrl: null,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: 10,
  }
}

function gameData(unlocked: string[]): RemoteGameAchievements {
  return {
    achievements: [achievement('a1'), achievement('a2')],
    unlocks: unlocked.map((id) => ({
      achievementExternalId: id,
      unlockedAt: null,
      progress: null,
    })),
  }
}

function fakeProvider(
  fetchGame: AchievementProvider['fetchGame'],
  platform: Platform = 'steam',
  listGames?: AchievementProvider['listGames'],
): AchievementProvider {
  const notUsed = (): never => {
    throw new Error('not used by the scheduler')
  }
  return {
    platform,
    capabilities: {
      localWatch: false,
      polling: true,
      globalRarity: true,
      oauth: false,
      unofficial: false,
    },
    authenticate: notUsed,
    validate: notUsed,
    listGames: listGames ?? notUsed,
    fetchGame,
  }
}

interface AccountSeed {
  readonly id: number
  readonly platform?: Platform
  readonly status?: string
  readonly games?: readonly string[]
}

function seedDb(accounts: readonly AccountSeed[] = [{ id: 1, games: ['g1'] }]): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  let nextGameId = 1
  for (const account of accounts) {
    db.prepare(
      `INSERT INTO account (id, platform, external_id, display_name, status, created_at)
       VALUES (?, ?, ?, 'Test', ?, '2026-01-01')`,
    ).run(
      account.id,
      account.platform ?? 'steam',
      `acc${account.id}`,
      account.status ?? 'connected',
    )
    for (const externalId of account.games ?? []) {
      const gameId = nextGameId++
      db.prepare('INSERT INTO game (id, title, sort_title) VALUES (?, ?, ?)').run(
        gameId,
        `Game ${externalId}`,
        `game ${externalId}`,
      )
      db.prepare(
        `INSERT INTO platform_game (game_id, account_id, platform, external_id, title)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(gameId, account.id, account.platform ?? 'steam', externalId, `Game ${externalId}`)
    }
  }
  return db
}

function accountStatus(db: DatabaseSync, id: number): string {
  return (db.prepare('SELECT status FROM account WHERE id = ?').get(id) as { status: string })
    .status
}

interface Harness {
  readonly scheduler: Scheduler
  readonly onUnlocks: ReturnType<typeof vi.fn<(events: UnlockEvent[]) => void>>
  readonly onDataChanged: ReturnType<typeof vi.fn<() => void>>
  advance(ms: number): void
  now(): Date
}

function harness(
  db: DatabaseSync,
  providers: Partial<Record<Platform, AchievementProvider>>,
  secrets: SecretStore = new InMemorySecretStore(),
): Harness {
  let now = START
  const onUnlocks = vi.fn<(events: UnlockEvent[]) => void>()
  const onDataChanged = vi.fn<() => void>()
  const scheduler = new Scheduler({
    db,
    providers,
    secrets,
    onUnlocks,
    onDataChanged,
    now: () => now,
    random: () => 0,
  })
  return {
    scheduler,
    onUnlocks,
    onDataChanged,
    advance: (ms) => {
      now = new Date(now.getTime() + ms)
    },
    now: () => now,
  }
}

function after(from: Date, ms: number): Date {
  return new Date(from.getTime() + ms)
}

describe('Scheduler.syncDueGames', () => {
  it('syncs a never-synced game straight away and schedules it one interval later', async () => {
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() =>
      Promise.resolve(gameData(['a1'])),
    )
    const { scheduler } = harness(db, { steam: fakeProvider(fetchGame) })

    const next = await scheduler.syncDueGames(1)

    expect(fetchGame).toHaveBeenCalledOnce()
    expect(next).toEqual(after(START, SYNC_INTERVAL_MS))
    expect(getSyncState(db, 1, 'game:g1')).toEqual({
      cursor: null,
      lastOkAt: START,
      lastError: null,
      nextDueAt: after(START, SYNC_INTERVAL_MS),
    })
  })

  it('leaves a game alone until it is due, and reports when it will be', async () => {
    const db = seedDb()
    const dueAt = after(START, 60 * SECONDS)
    upsertSyncState(db, 1, 'game:g1', {
      cursor: null,
      lastOkAt: null,
      lastError: null,
      nextDueAt: dueAt,
    })
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>()
    const { scheduler } = harness(db, { steam: fakeProvider(fetchGame) })

    expect(await scheduler.syncDueGames(1)).toEqual(dueAt)
    expect(fetchGame).not.toHaveBeenCalled()
  })

  it('sends new unlocks to onUnlocks, but never for the first (baseline) sync', async () => {
    const db = seedDb()
    let data = gameData(['a1'])
    const { scheduler, onUnlocks, advance } = harness(db, {
      steam: fakeProvider(() => Promise.resolve(data)),
    })

    await scheduler.syncDueGames(1)
    expect(onUnlocks).not.toHaveBeenCalled()

    data = gameData(['a1', 'a2'])
    advance(SYNC_INTERVAL_MS)
    await scheduler.syncDueGames(1)

    expect(onUnlocks).toHaveBeenCalledOnce()
    const events = onUnlocks.mock.calls[0]?.[0]
    expect(events).toHaveLength(1)
    expect(events?.[0]?.achievement.externalId).toBe('a2')
  })

  it('builds the credentials from the account and its secret', async () => {
    const db = seedDb()
    const secrets = new InMemorySecretStore()
    const secret = new Secret('api-key')
    secrets.save('1', secret)
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const { scheduler } = harness(db, { steam: fakeProvider(fetchGame) }, secrets)

    await scheduler.syncDueGames(1)

    expect(fetchGame.mock.calls[0]?.[0]).toEqual({
      platform: 'steam',
      externalId: 'acc1',
      secret,
    })
  })

  it('backs off exponentially on network errors, and starts again from the base after a success', async () => {
    const db = seedDb()
    let fail = true
    const provider = fakeProvider(() =>
      fail
        ? Promise.reject(new ProviderError('network', 'offline'))
        : Promise.resolve(gameData([])),
    )
    const { scheduler, advance, now } = harness(db, { steam: provider })

    expect(await scheduler.syncDueGames(1)).toEqual(after(now(), 30 * SECONDS))
    advance(30 * SECONDS)
    expect(await scheduler.syncDueGames(1)).toEqual(after(now(), 60 * SECONDS))
    advance(60 * SECONDS)
    expect(await scheduler.syncDueGames(1)).toEqual(after(now(), 120 * SECONDS))
    expect(getSyncState(db, 1, 'game:g1')?.lastError).toBe('offline')

    advance(120 * SECONDS)
    fail = false
    expect(await scheduler.syncDueGames(1)).toEqual(after(now(), SYNC_INTERVAL_MS))

    advance(SYNC_INTERVAL_MS)
    fail = true
    expect(await scheduler.syncDueGames(1)).toEqual(after(now(), 30 * SECONDS))
  })

  it("waits for a rate limit's retryAfterMs when it is longer than the backoff", async () => {
    const db = seedDb()
    const provider = fakeProvider(() =>
      Promise.reject(new ProviderError('rate_limited', 'slow down', { retryAfterMs: 10 * 60_000 })),
    )
    const { scheduler } = harness(db, { steam: provider })

    expect(await scheduler.syncDueGames(1)).toEqual(after(START, 10 * 60_000))
  })

  it('on an expired login, marks the account needs_reauth and stops polling it', async () => {
    const db = seedDb()
    const provider = fakeProvider(() =>
      Promise.reject(new ProviderError('auth_expired', 'token expired')),
    )
    const { scheduler } = harness(db, { steam: provider })

    expect(await scheduler.syncDueGames(1)).toBeNull()
    expect(accountStatus(db, 1)).toBe('needs_reauth')
    expect(getSyncState(db, 1, 'game:g1')).toMatchObject({
      lastError: 'token expired',
      nextDueAt: null,
    })
  })

  it('on any other error, records it, keeps the last success, and retries at the normal pace', async () => {
    const db = seedDb()
    let fail = false
    const provider = fakeProvider(() =>
      fail
        ? Promise.reject(new ProviderError('parse', 'unexpected response'))
        : Promise.resolve(gameData([])),
    )
    const { scheduler, advance, now } = harness(db, { steam: provider })
    await scheduler.syncDueGames(1)
    const lastOkAt = now()

    advance(SYNC_INTERVAL_MS)
    fail = true
    expect(await scheduler.syncDueGames(1)).toEqual(after(now(), SYNC_INTERVAL_MS))
    expect(getSyncState(db, 1, 'game:g1')).toMatchObject({
      lastOkAt,
      lastError: 'unexpected response',
    })
  })

  it("keeps going with an account's other games when one of them fails", async () => {
    const db = seedDb([{ id: 1, games: ['g1', 'g2'] }])
    const provider = fakeProvider((_credentials, game) =>
      game.externalId === 'g1'
        ? Promise.reject(new ProviderError('parse', 'broken'))
        : Promise.resolve(gameData([])),
    )
    const { scheduler } = harness(db, { steam: provider })

    await scheduler.syncDueGames(1)

    expect(getSyncState(db, 1, 'game:g1')?.lastError).toBe('broken')
    expect(getSyncState(db, 1, 'game:g2')).toMatchObject({ lastOkAt: START, lastError: null })
  })

  it('returns null for an account whose platform has no provider', async () => {
    const db = seedDb([{ id: 1, platform: 'xbox', games: ['g1'] }])
    const { scheduler } = harness(db, { steam: fakeProvider(vi.fn()) })

    expect(await scheduler.syncDueGames(1)).toBeNull()
  })

  it('checks an account with no games again after a normal interval', async () => {
    const db = seedDb([{ id: 1, games: [] }])
    const { scheduler } = harness(db, { steam: fakeProvider(vi.fn()) })

    expect(await scheduler.syncDueGames(1)).toEqual(after(START, SYNC_INTERVAL_MS))
  })
})

describe('Scheduler.start / stop', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function realClockScheduler(
    db: DatabaseSync,
    providers: Partial<Record<Platform, AchievementProvider>>,
  ): Scheduler {
    return new Scheduler({
      db,
      providers,
      secrets: new InMemorySecretStore(),
      onUnlocks: () => undefined,
    })
  }

  it('polls each connected account with a provider on start, then again on schedule', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const scheduler = realClockScheduler(db, { steam: fakeProvider(fetchGame) })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchGame).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS)
    expect(fetchGame).toHaveBeenCalledTimes(2)

    scheduler.stop()
  })

  it('does not poll an account that is not connected', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb([{ id: 1, status: 'needs_reauth', games: ['g1'] }])
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>()
    const scheduler = realClockScheduler(db, { steam: fakeProvider(fetchGame) })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS)

    expect(fetchGame).not.toHaveBeenCalled()
    scheduler.stop()
  })

  it("keeps one account's failures from affecting another", async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb([
      { id: 1, platform: 'steam', games: ['g1'] },
      { id: 2, platform: 'xbox', games: ['g2'] },
    ])
    const failing = vi.fn<AchievementProvider['fetchGame']>(() =>
      Promise.reject(new ProviderError('network', 'offline')),
    )
    const healthy = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const scheduler = realClockScheduler(db, {
      steam: fakeProvider(failing),
      xbox: fakeProvider(healthy, 'xbox'),
    })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS)

    expect(failing.mock.calls.length).toBeGreaterThan(1)
    expect(healthy).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('stop() cancels the next round and aborts a fetch that is in flight', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    let signal: AbortSignal | undefined
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>((_credentials, _game, s) => {
      signal = s
      return new Promise(() => undefined)
    })
    const scheduler = realClockScheduler(db, { steam: fakeProvider(fetchGame) })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    scheduler.stop()

    expect(signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 3)
    expect(fetchGame).toHaveBeenCalledOnce()
  })
})

function libraryGame(externalId: string, recentlyPlayed = true): RemoteGame {
  return {
    ref: { externalId },
    title: `Game ${externalId}`,
    iconUrl: null,
    coverUrl: null,
    lastPlayed: null,
    recentlyPlayed,
  }
}

describe('Scheduler.startAccount', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function schedulerFor(db: DatabaseSync, fetchGame: AchievementProvider['fetchGame']): Scheduler {
    return new Scheduler({
      db,
      providers: { steam: fakeProvider(fetchGame) },
      secrets: new InMemorySecretStore(),
      onUnlocks: () => undefined,
    })
  }

  it('starts syncing an account connected after the app started', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb([])
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const scheduler = schedulerFor(db, fetchGame)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)

    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (1, 'steam', 'acc1', 'Test', 'connected', '2026-01-01');
      INSERT INTO game (id, title, sort_title) VALUES (1, 'Game g1', 'game g1');
      INSERT INTO platform_game (game_id, account_id, platform, external_id, title)
      VALUES (1, 1, 'steam', 'g1', 'Game g1');
    `)
    scheduler.startAccount(1)
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchGame).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS)
    expect(fetchGame).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('syncs a sleeping account straight away, without starting a second loop', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const scheduler = schedulerFor(db, fetchGame)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    upsertSyncState(db, 1, 'game:g1', {
      cursor: null,
      lastOkAt: START,
      lastError: null,
      nextDueAt: START,
    })

    scheduler.startAccount(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchGame).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS)
    expect(fetchGame).toHaveBeenCalledTimes(3)
    scheduler.stop()
  })

  it('does not start a second round while one is already running', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => new Promise(() => undefined))
    const scheduler = schedulerFor(db, fetchGame)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)

    scheduler.startAccount(1)
    scheduler.startAccount(1)
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchGame).toHaveBeenCalledOnce()
    scheduler.stop()
  })

  it('does nothing while the scheduler is stopped', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const scheduler = schedulerFor(db, fetchGame)

    scheduler.startAccount(1)
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchGame).not.toHaveBeenCalled()
  })
})

describe('Scheduler.syncLibrary', () => {
  it('on the first look, adds every listed game with no cutoff, so their first syncs stay silent', async () => {
    const db = seedDb([{ id: 1, games: [] }])
    const listGames = vi.fn<AchievementProvider['listGames']>(() =>
      Promise.resolve([libraryGame('g1'), libraryGame('g2')]),
    )
    const { scheduler } = harness(db, { steam: fakeProvider(vi.fn(), 'steam', listGames) })

    const next = await scheduler.syncLibrary(1)

    expect(next).toEqual(after(START, SYNC_INTERVAL_MS))
    expect(listPlatformGameExternalIds(db, 1)).toEqual(['g1', 'g2'])
    expect(getPlatformGameByExternalId(db, 1, 'g1').baselineCutoff).toBeNull()
    expect(getSyncState(db, 1, LIBRARY_SCOPE)).toEqual({
      cursor: null,
      lastOkAt: START,
      lastError: null,
      nextDueAt: after(START, SYNC_INTERVAL_MS),
    })
  })

  it('gives a game found on a later look the previous look as its cutoff', async () => {
    const db = seedDb([{ id: 1, games: [] }])
    let games = [libraryGame('g1')]
    const provider = fakeProvider(vi.fn(), 'steam', () => Promise.resolve(games))
    const { scheduler, advance } = harness(db, { steam: provider })
    await scheduler.syncLibrary(1)

    games = [libraryGame('g1'), libraryGame('new')]
    advance(SYNC_INTERVAL_MS)
    await scheduler.syncLibrary(1)

    expect(getPlatformGameByExternalId(db, 1, 'new').baselineCutoff).toEqual(START)
    expect(getPlatformGameByExternalId(db, 1, 'g1').baselineCutoff).toBeNull()
  })

  it('does not ask for the library again until it is due', async () => {
    const db = seedDb([{ id: 1, games: [] }])
    const listGames = vi.fn<AchievementProvider['listGames']>(() => Promise.resolve([]))
    const { scheduler, advance } = harness(db, {
      steam: fakeProvider(vi.fn(), 'steam', listGames),
    })
    await scheduler.syncLibrary(1)

    advance(SYNC_INTERVAL_MS - 1)
    expect(await scheduler.syncLibrary(1)).toEqual(after(START, SYNC_INTERVAL_MS))
    expect(listGames).toHaveBeenCalledOnce()
  })

  it('backs off on a network error and leaves the known games alone', async () => {
    const db = seedDb()
    const provider = fakeProvider(vi.fn(), 'steam', () =>
      Promise.reject(new ProviderError('network', 'offline')),
    )
    const { scheduler } = harness(db, { steam: provider })

    expect(await scheduler.syncLibrary(1)).toEqual(after(START, 30 * SECONDS))
    expect(getSyncState(db, 1, LIBRARY_SCOPE)?.lastError).toBe('offline')
    expect(listPlatformGameExternalIds(db, 1)).toEqual(['g1'])
  })

  it('on an expired login, marks the account needs_reauth and stops', async () => {
    const db = seedDb()
    const provider = fakeProvider(vi.fn(), 'steam', () =>
      Promise.reject(new ProviderError('auth_expired', 'key revoked')),
    )
    const { scheduler } = harness(db, { steam: provider })

    expect(await scheduler.syncLibrary(1)).toBeNull()
    expect(accountStatus(db, 1)).toBe('needs_reauth')
  })

  it('returns null for an account whose platform has no provider', async () => {
    const db = seedDb([{ id: 1, platform: 'xbox', games: [] }])
    const { scheduler } = harness(db, { steam: fakeProvider(vi.fn()) })

    expect(await scheduler.syncLibrary(1)).toBeNull()
  })

  it('reports a change when a look finds new games, and only then', async () => {
    const db = seedDb([{ id: 1, games: [] }])
    const provider = fakeProvider(vi.fn(), 'steam', () => Promise.resolve([libraryGame('g1')]))
    const { scheduler, advance, onDataChanged } = harness(db, { steam: provider })

    await scheduler.syncLibrary(1)
    expect(onDataChanged).toHaveBeenCalledOnce()

    advance(SYNC_INTERVAL_MS)
    await scheduler.syncLibrary(1)
    expect(onDataChanged).toHaveBeenCalledOnce()
  })

  it('reports a change when a login expires', async () => {
    const db = seedDb()
    const provider = fakeProvider(vi.fn(), 'steam', () =>
      Promise.reject(new ProviderError('auth_expired', 'key revoked')),
    )
    const { scheduler, onDataChanged } = harness(db, { steam: provider })

    await scheduler.syncLibrary(1)

    expect(onDataChanged).toHaveBeenCalledOnce()
  })

  it('reports a change after each game it syncs', async () => {
    const db = seedDb([{ id: 1, games: ['g1', 'g2'] }])
    const { scheduler, onDataChanged } = harness(db, {
      steam: fakeProvider(() => Promise.resolve(gameData([]))),
    })

    await scheduler.syncDueGames(1)

    expect(onDataChanged).toHaveBeenCalledTimes(2)
  })

  it('does not report a change for a failure that leaves the data as it was', async () => {
    const db = seedDb()
    const provider = fakeProvider(vi.fn(), 'steam', () =>
      Promise.reject(new ProviderError('network', 'offline')),
    )
    const { scheduler, onDataChanged } = harness(db, { steam: provider })

    await scheduler.syncLibrary(1)

    expect(onDataChanged).not.toHaveBeenCalled()
  })
})

describe('Scheduler tiered polling', () => {
  function libraryOf(games: RemoteGame[]): AchievementProvider['listGames'] {
    return () => Promise.resolve(games)
  }

  it('polls recently played games every interval, and the rest only every idle interval', async () => {
    const db = seedDb([{ id: 1, games: ['recent', 'idle'] }])
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const listGames = libraryOf([libraryGame('recent'), libraryGame('idle', false)])
    const { scheduler, advance } = harness(db, {
      steam: fakeProvider(fetchGame, 'steam', listGames),
    })
    await scheduler.syncLibrary(1)

    expect(await scheduler.syncDueGames(1)).toEqual(after(START, SYNC_INTERVAL_MS))
    expect(fetchGame).toHaveBeenCalledTimes(2)

    advance(SYNC_INTERVAL_MS)
    await scheduler.syncDueGames(1)
    expect(fetchGame.mock.calls.map((call) => call[1].externalId)).toEqual([
      'recent',
      'idle',
      'recent',
    ])

    advance(IDLE_INTERVAL_MS - SYNC_INTERVAL_MS)
    await scheduler.syncDueGames(1)
    expect(fetchGame.mock.calls.filter((call) => call[1].externalId === 'idle')).toHaveLength(2)
  })

  it('reports an idle game as due one idle interval after its last success', async () => {
    const db = seedDb([{ id: 1, games: ['idle'] }])
    const listGames = libraryOf([libraryGame('idle', false)])
    const { scheduler } = harness(db, {
      steam: fakeProvider(() => Promise.resolve(gameData([])), 'steam', listGames),
    })
    await scheduler.syncLibrary(1)

    expect(await scheduler.syncDueGames(1)).toEqual(after(START, IDLE_INTERVAL_MS))
  })

  it('polls an idle game again soon after it starts being played', async () => {
    const db = seedDb([{ id: 1, games: ['g1'] }])
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    let games = [libraryGame('g1', false)]
    const { scheduler, advance } = harness(db, {
      steam: fakeProvider(fetchGame, 'steam', () => Promise.resolve(games)),
    })
    await scheduler.syncLibrary(1)
    await scheduler.syncDueGames(1)

    games = [libraryGame('g1', true)]
    advance(SYNC_INTERVAL_MS)
    await scheduler.syncLibrary(1)
    await scheduler.syncDueGames(1)

    expect(fetchGame).toHaveBeenCalledTimes(2)
  })

  it('treats every game as recent until the library has been read', async () => {
    const db = seedDb([{ id: 1, games: ['g1'] }])
    const { scheduler } = harness(db, {
      steam: fakeProvider(() => Promise.resolve(gameData([]))),
    })

    expect(await scheduler.syncDueGames(1)).toEqual(after(START, SYNC_INTERVAL_MS))
  })

  it(
    'stays within Steam’s daily budget: 171 games, 11 of them recent, over a day',
    { timeout: 30_000 },
    async () => {
      vi.useFakeTimers({ now: START })
      const ids = Array.from({ length: 171 }, (_, index) => `g${index}`)
      const db = seedDb([{ id: 1, games: [] }])
      const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
      const listGames = vi.fn(libraryOf(ids.map((id, index) => libraryGame(id, index < 11))))
      const scheduler = new Scheduler({
        db,
        providers: { steam: fakeProvider(fetchGame, 'steam', listGames) },
        secrets: new InMemorySecretStore(),
        onUnlocks: () => undefined,
      })

      scheduler.start()
      await vi.advanceTimersByTimeAsync(24 * 60 * 60_000)
      scheduler.stop()
      vi.useRealTimers()

      const requests = fetchGame.mock.calls.length * 3 + listGames.mock.calls.length * 2
      expect(requests).toBeLessThan(15_000)
      expect(fetchGame.mock.calls.filter((call) => call[1].externalId === 'g0').length).toBe(289)
      expect(fetchGame.mock.calls.filter((call) => call[1].externalId === 'g170').length).toBe(5)
    },
  )
})

describe('Scheduler rounds: finding games and the baseline', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('finds games and syncs them in the same round, silently on the first look', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb([{ id: 1, games: [] }])
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() =>
      Promise.resolve({
        achievements: [achievement('a1')],
        unlocks: [{ achievementExternalId: 'a1', unlockedAt: START, progress: null }],
      }),
    )
    const onUnlocks = vi.fn()
    const scheduler = new Scheduler({
      db,
      providers: {
        steam: fakeProvider(fetchGame, 'steam', () => Promise.resolve([libraryGame('g1')])),
      },
      secrets: new InMemorySecretStore(),
      onUnlocks,
    })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    scheduler.stop()

    expect(fetchGame).toHaveBeenCalledOnce()
    expect(getPlatformGameByExternalId(db, 1, 'g1').baselineDone).toBe(true)
    expect(onUnlocks).not.toHaveBeenCalled()
  })

  it('announces what was unlocked in a newly found game since the last look, but not before it', async () => {
    const db = seedDb([{ id: 1, games: [] }])
    let games = [libraryGame('known')]
    const lookedAt = START
    const unlocks = [
      { achievementExternalId: 'a1', unlockedAt: after(lookedAt, -60 * SECONDS), progress: null },
      { achievementExternalId: 'a2', unlockedAt: after(lookedAt, 60 * SECONDS), progress: null },
    ]
    const provider = fakeProvider(
      () => Promise.resolve({ achievements: [achievement('a1'), achievement('a2')], unlocks }),
      'steam',
      () => Promise.resolve(games),
    )
    const { scheduler, onUnlocks, advance } = harness(db, { steam: provider })
    await scheduler.syncLibrary(1)
    await scheduler.syncDueGames(1)
    expect(onUnlocks).not.toHaveBeenCalled()

    games = [libraryGame('known'), libraryGame('borrowed')]
    advance(SYNC_INTERVAL_MS)
    await scheduler.syncLibrary(1)
    await scheduler.syncDueGames(1)

    expect(onUnlocks).toHaveBeenCalledOnce()
    const events = onUnlocks.mock.calls[0]?.[0]
    expect(events?.map((event) => event.gameTitle)).toEqual(['Game borrowed'])
    expect(events?.map((event) => event.achievement.externalId)).toEqual(['a2'])
  })
})

describe('Scheduler retry jitter', () => {
  it('adds random jitter on top of the backoff delay', async () => {
    const db = seedDb()
    const provider = fakeProvider(() => Promise.reject(new ProviderError('network', 'offline')))
    const scheduler = new Scheduler({
      db,
      providers: { steam: provider },
      secrets: new InMemorySecretStore(),
      onUnlocks: vi.fn(),
      now: () => START,
      random: () => 0.5,
    })

    expect(await scheduler.syncDueGames(1)).toEqual(after(START, 33 * SECONDS))
  })
})

describe('Scheduler.refreshCredentials', () => {
  type Refresh = NonNullable<AchievementProvider['refresh']>

  function refreshingProvider(refresh: Refresh, listGames?: AchievementProvider['listGames']) {
    return { ...fakeProvider(vi.fn(), 'xbox', listGames), refresh: vi.fn(refresh) }
  }

  function xboxDb(): DatabaseSync {
    return seedDb([{ id: 1, platform: 'xbox', games: [] }])
  }

  function storeWith(value: string): InMemorySecretStore {
    const secrets = new InMemorySecretStore()
    secrets.save('1', new Secret(value))
    return secrets
  }

  it('is ready straight away for a provider without refresh', async () => {
    const { scheduler } = harness(seedDb(), { steam: fakeProvider(vi.fn()) })

    expect(await scheduler.refreshCredentials(1)).toBe(READY)
  })

  it('passes the stored credentials to the provider', async () => {
    const provider = refreshingProvider((credentials) => Promise.resolve(credentials))
    const { scheduler } = harness(xboxDb(), { xbox: provider }, storeWith('stored-token'))

    await scheduler.refreshCredentials(1)

    const credentials = provider.refresh.mock.calls[0]?.[0]
    expect(credentials?.platform).toBe('xbox')
    expect(credentials?.externalId).toBe('acc1')
    expect(credentials?.secret?.expose()).toBe('stored-token')
  })

  it('saves a rotated secret so the rest of the round and later rounds use it', async () => {
    const secrets = storeWith('old-token')
    const provider = refreshingProvider((credentials) =>
      Promise.resolve({ ...credentials, secret: new Secret('new-token') }),
    )
    const { scheduler } = harness(xboxDb(), { xbox: provider }, secrets)

    expect(await scheduler.refreshCredentials(1)).toBe(READY)
    expect(secrets.find('1')?.expose()).toBe('new-token')
  })

  it('does not rewrite the store when the secret is unchanged', async () => {
    const secrets = storeWith('same-token')
    const save = vi.spyOn(secrets, 'save')
    const provider = refreshingProvider((credentials) =>
      Promise.resolve({ ...credentials, secret: new Secret('same-token') }),
    )
    const { scheduler } = harness(xboxDb(), { xbox: provider }, secrets)

    await scheduler.refreshCredentials(1)

    expect(save).not.toHaveBeenCalled()
  })

  it('on an expired sign-in, marks the account needs_reauth and stops', async () => {
    const db = xboxDb()
    const provider = refreshingProvider(() =>
      Promise.reject(new ProviderError('auth_expired', 'refresh token revoked')),
    )
    const { scheduler, onDataChanged } = harness(db, { xbox: provider }, storeWith('t'))

    expect(await scheduler.refreshCredentials(1)).toBeNull()
    expect(accountStatus(db, 1)).toBe('needs_reauth')
    expect(onDataChanged).toHaveBeenCalled()
  })

  it('backs off on a network error and records it against the library', async () => {
    const db = xboxDb()
    const provider = refreshingProvider(() =>
      Promise.reject(new ProviderError('network', 'offline')),
    )
    const { scheduler, now } = harness(db, { xbox: provider }, storeWith('t'))

    expect(await scheduler.refreshCredentials(1)).toEqual(after(now(), 30 * SECONDS))
    expect(await scheduler.refreshCredentials(1)).toEqual(after(now(), 60 * SECONDS))
    expect(getSyncState(db, 1, LIBRARY_SCOPE)?.lastError).toBe('offline')
    expect(accountStatus(db, 1)).toBe('connected')
  })

  it('refreshes before reading the library in a round, and skips the round when it fails', async () => {
    vi.useFakeTimers({ now: START })
    const calls: string[] = []
    const provider = refreshingProvider(
      () => {
        calls.push('refresh')
        return Promise.reject(new ProviderError('network', 'offline'))
      },
      () => {
        calls.push('listGames')
        return Promise.resolve([])
      },
    )
    const scheduler = new Scheduler({
      db: xboxDb(),
      providers: { xbox: provider },
      secrets: storeWith('t'),
      onUnlocks: vi.fn(),
      random: () => 0,
    })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual(['refresh'])

    provider.refresh.mockImplementation((credentials) => {
      calls.push('refresh')
      return Promise.resolve(credentials)
    })
    await vi.advanceTimersByTimeAsync(30 * SECONDS)
    expect(calls).toEqual(['refresh', 'refresh', 'listGames'])

    scheduler.stop()
    vi.useRealTimers()
  })
})

describe('Scheduler watches and syncGameNow', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  interface Watching {
    readonly scheduler: Scheduler
    readonly onUnlocks: ReturnType<typeof vi.fn<(events: UnlockEvent[]) => void>>
    readonly watch: ReturnType<typeof vi.fn<NonNullable<AchievementProvider['watch']>>>
    readonly stopWatch: ReturnType<typeof vi.fn<() => void>>
    change(gameId: string): void
  }

  function watching(
    db: DatabaseSync,
    fetchGame: AchievementProvider['fetchGame'],
    listGames?: AchievementProvider['listGames'],
  ): Watching {
    const listeners = new Map<string, (game: RemoteGameRef) => void>()
    const stopWatch = vi.fn<() => void>()
    const watch = vi.fn<NonNullable<AchievementProvider['watch']>>((credentials, onChange) => {
      listeners.set(credentials.externalId, onChange)
      return stopWatch
    })
    const onUnlocks = vi.fn<(events: UnlockEvent[]) => void>()
    const scheduler = new Scheduler({
      db,
      providers: { steam: { ...fakeProvider(fetchGame, 'steam', listGames), watch } },
      secrets: new InMemorySecretStore(),
      onUnlocks,
      random: () => 0,
    })
    return {
      scheduler,
      onUnlocks,
      watch,
      stopWatch,
      change: (gameId) => listeners.get('acc1')?.({ externalId: gameId }),
    }
  }

  it('starts a watch for each connected account on start, and stops it on stop', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb([
      { id: 1, games: ['g1'] },
      { id: 2, status: 'needs_reauth', games: [] },
    ])
    const { scheduler, watch, stopWatch } = watching(db, () => Promise.resolve(gameData([])))

    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(watch).toHaveBeenCalledOnce()
    expect(watch.mock.calls[0]?.[0]).toMatchObject({ platform: 'steam', externalId: 'acc1' })

    scheduler.stop()
    expect(stopWatch).toHaveBeenCalledOnce()
  })

  it('syncs a game straight away when its watch reports a change, and toasts new unlocks', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    let data = gameData([])
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(data))
    const { scheduler, onUnlocks, change } = watching(db, fetchGame)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchGame).toHaveBeenCalledOnce()

    data = gameData(['a1'])
    change('g1')
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchGame).toHaveBeenCalledTimes(2)
    expect(fetchGame.mock.calls[1]?.[1]).toEqual({ externalId: 'g1' })
    expect(onUnlocks).toHaveBeenCalledOnce()
    expect(onUnlocks.mock.calls[0]?.[0].map((event) => event.achievement.externalId)).toEqual([
      'a1',
    ])
    scheduler.stop()
  })

  it('leaves a game alone while it is backing off after an error', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() =>
      Promise.reject(new ProviderError('rate_limited', 'slow down', { retryAfterMs: 60_000 })),
    )
    const { scheduler, change } = watching(db, fetchGame)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchGame).toHaveBeenCalledOnce()

    change('g1')
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchGame).toHaveBeenCalledOnce()
    scheduler.stop()
  })

  it('runs one more sync, not one per signal, for changes reported during a sync', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const { scheduler, change } = watching(db, fetchGame)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)

    let finish: () => void = () => undefined
    fetchGame.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(gameData([]))
        }),
    )
    change('g1')
    await vi.advanceTimersByTimeAsync(0)
    change('g1')
    change('g1')
    finish()
    await vi.advanceTimersByTimeAsync(0)
    finish()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchGame).toHaveBeenCalledTimes(3)
    scheduler.stop()
  })

  it('looks for a game it does not know in the library straight away, then syncs it', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    let games = [libraryGame('g1')]
    const listGames = vi.fn<AchievementProvider['listGames']>(() => Promise.resolve(games))
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const { scheduler, change } = watching(db, fetchGame, listGames)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(listGames).toHaveBeenCalledOnce()

    games = [libraryGame('g1'), libraryGame('g2')]
    change('g2')
    await vi.advanceTimersByTimeAsync(0)

    expect(listGames).toHaveBeenCalledTimes(2)
    expect(listPlatformGameExternalIds(db, 1)).toEqual(['g1', 'g2'])
    expect(fetchGame.mock.calls.map((call) => call[1])).toContainEqual({ externalId: 'g2' })
    scheduler.stop()
  })

  it('looks for a game the library does not list only once until the next library sync', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const listGames = vi.fn<AchievementProvider['listGames']>(() =>
      Promise.resolve([libraryGame('g1')]),
    )
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const { scheduler, change } = watching(db, fetchGame, listGames)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)

    change('no-achievements')
    await vi.advanceTimersByTimeAsync(0)
    change('no-achievements')
    await vi.advanceTimersByTimeAsync(0)
    expect(listGames).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS)
    expect(listGames).toHaveBeenCalledTimes(3)
    change('no-achievements')
    await vi.advanceTimersByTimeAsync(0)

    expect(listGames).toHaveBeenCalledTimes(4)
    expect(fetchGame.mock.calls.map((call) => call[1])).not.toContainEqual({
      externalId: 'no-achievements',
    })
    scheduler.stop()
  })

  it('does not force a library sync while the library is backing off', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const listGames = vi.fn<AchievementProvider['listGames']>(() =>
      Promise.reject(new ProviderError('network', 'offline')),
    )
    const { scheduler, change } = watching(db, () => Promise.resolve(gameData([])), listGames)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)

    change('g2')
    await vi.advanceTimersByTimeAsync(0)

    expect(listGames).toHaveBeenCalledOnce()
    scheduler.stop()
  })

  it('stops the watch when the account needs signing in again', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const { scheduler, stopWatch } = watching(db, () =>
      Promise.reject(new ProviderError('auth_expired', 'key revoked')),
    )

    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(accountStatus(db, 1)).toBe('needs_reauth')
    expect(stopWatch).toHaveBeenCalledOnce()
    scheduler.stop()
  })

  it('starts one watch for an account connected after the app started', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb([])
    const { scheduler, watch } = watching(db, () => Promise.resolve(gameData([])))
    scheduler.start()
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (1, 'steam', 'acc1', 'Test', 'connected', '2026-01-01')
    `)

    scheduler.startAccount(1)
    scheduler.startAccount(1)
    await vi.advanceTimersByTimeAsync(0)

    expect(watch).toHaveBeenCalledOnce()
    scheduler.stop()
  })

  it('ignores reported changes while stopped', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() => Promise.resolve(gameData([])))
    const { scheduler, change } = watching(db, fetchGame)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    scheduler.stop()

    change('g1')
    await vi.advanceTimersByTimeAsync(0)
    await scheduler.syncGameNow(1, 'g1')

    expect(fetchGame).toHaveBeenCalledOnce()
  })
})
