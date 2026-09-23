import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type {
  RemoteAchievement,
  RemoteGame,
  RemoteGameAchievements,
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
import { IDLE_INTERVAL_MS, LIBRARY_SCOPE, Scheduler, SYNC_INTERVAL_MS } from './scheduler'

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

// Accounts and their known games, on a database built by the real migrations.
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
  readonly onAccountsChanged: ReturnType<typeof vi.fn<() => void>>
  /** Moves the scheduler's clock forward. */
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
  const onAccountsChanged = vi.fn<() => void>()
  const scheduler = new Scheduler({
    db,
    providers,
    secrets,
    onUnlocks,
    onAccountsChanged,
    now: () => now,
  })
  return {
    scheduler,
    onUnlocks,
    onAccountsChanged,
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
    // No due time, so the game syncs straight away once the account is reconnected.
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

  // These use the real clock inside the Scheduler (no `now` passed), which vi's fake timers
  // control, so moving time forward both fires the timers and makes games due.
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

    expect(failing.mock.calls.length).toBeGreaterThan(1) // retried on its own backoff
    expect(healthy).toHaveBeenCalledTimes(2) // on its normal schedule regardless
    scheduler.stop()
  })

  it('stop() cancels the next round and aborts a fetch that is in flight', async () => {
    vi.useFakeTimers({ now: START })
    const db = seedDb()
    let signal: AbortSignal | undefined
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>((_credentials, _game, s) => {
      signal = s
      return new Promise(() => undefined) // never settles on its own
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

  it('reports a change to the accounts when a look finds new games, and only then', async () => {
    const db = seedDb([{ id: 1, games: [] }])
    const provider = fakeProvider(vi.fn(), 'steam', () => Promise.resolve([libraryGame('g1')]))
    const { scheduler, advance, onAccountsChanged } = harness(db, { steam: provider })

    await scheduler.syncLibrary(1)
    expect(onAccountsChanged).toHaveBeenCalledOnce()

    advance(SYNC_INTERVAL_MS)
    await scheduler.syncLibrary(1)
    expect(onAccountsChanged).toHaveBeenCalledOnce()
  })

  it('reports a change to the accounts when a login expires', async () => {
    const db = seedDb()
    const provider = fakeProvider(vi.fn(), 'steam', () =>
      Promise.reject(new ProviderError('auth_expired', 'key revoked')),
    )
    const { scheduler, onAccountsChanged } = harness(db, { steam: provider })

    await scheduler.syncLibrary(1)

    expect(onAccountsChanged).toHaveBeenCalledOnce()
  })

  it('does not report a change for a failure that leaves the account as it was', async () => {
    const db = seedDb()
    const provider = fakeProvider(vi.fn(), 'steam', () =>
      Promise.reject(new ProviderError('network', 'offline')),
    )
    const { scheduler, onAccountsChanged } = harness(db, { steam: provider })

    await scheduler.syncLibrary(1)

    expect(onAccountsChanged).not.toHaveBeenCalled()
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

    // Both are synced once straight away (their first sync), then tiered.
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

  it('stays within Steam’s daily budget: 171 games, 11 of them recent, over a day', async () => {
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

    // Steam's fetchGame is 3 requests and listGames 2; the key's limit is 100,000 a day.
    const requests = fetchGame.mock.calls.length * 3 + listGames.mock.calls.length * 2
    expect(requests).toBeLessThan(15_000)
    expect(fetchGame.mock.calls.filter((call) => call[1].externalId === 'g0').length).toBe(289)
    expect(fetchGame.mock.calls.filter((call) => call[1].externalId === 'g170').length).toBe(5)
  })
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
