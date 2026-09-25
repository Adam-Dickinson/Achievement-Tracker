import type { DatabaseSync } from 'node:sqlite'
import { ProviderError } from '@shared/errors'
import type { AccountCredentials, RemoteGame, UnlockEvent } from '@shared/models'
import type { Platform } from '@shared/platform'
import type { AchievementProvider } from '@shared/provider'
import type { SecretStore } from '@shared/secret-store'
import {
  type AccountRow,
  addPlatformGames,
  getAccount,
  getSyncState,
  listConnectedAccounts,
  listPlatformGameExternalIds,
  setAccountStatus,
  type SyncStateRow,
  upsertSyncState,
} from '../store/sync-store'
import { backoffDelayMs, withJitter } from './backoff'
import { runSyncPass } from './sync-pass'

export const SYNC_INTERVAL_MS = 5 * 60_000
export const IDLE_INTERVAL_MS = 6 * 60 * 60_000
export const LIBRARY_SCOPE = 'library'
export const READY = 'ready'

const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 30 * 60_000

export interface SchedulerDeps {
  readonly db: DatabaseSync
  readonly providers: Partial<Record<Platform, AchievementProvider>>
  readonly secrets: SecretStore
  readonly onUnlocks: (events: UnlockEvent[]) => void
  readonly onDataChanged?: () => void
  readonly intervalMs?: number
  readonly now?: () => Date
  readonly random?: () => number
}

export class Scheduler {
  readonly #db: DatabaseSync
  readonly #providers: Partial<Record<Platform, AchievementProvider>>
  readonly #secrets: SecretStore
  readonly #onUnlocks: (events: UnlockEvent[]) => void
  readonly #onDataChanged: () => void
  readonly #intervalMs: number
  readonly #now: () => Date
  readonly #random: () => number

  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>()
  readonly #attempts = new Map<string, number>()
  readonly #recent = new Map<number, ReadonlySet<string>>()
  readonly #inRound = new Set<number>()
  readonly #watches = new Map<number, () => void>()
  readonly #urgent = new Map<string, boolean>()
  readonly #unlisted = new Map<number, Set<string>>()
  #abort = new AbortController()
  #running = false

  constructor(deps: SchedulerDeps) {
    this.#db = deps.db
    this.#providers = deps.providers
    this.#secrets = deps.secrets
    this.#onUnlocks = deps.onUnlocks
    this.#onDataChanged = deps.onDataChanged ?? (() => undefined)
    this.#intervalMs = deps.intervalMs ?? SYNC_INTERVAL_MS
    this.#now = deps.now ?? (() => new Date())
    this.#random = deps.random ?? Math.random
  }

  start(): void {
    if (this.#running) return
    this.#running = true
    this.#abort = new AbortController()

    for (const account of listConnectedAccounts(this.#db)) {
      if (!this.#providers[account.platform]) continue
      this.#watch(account)
      void this.#runLoop(account.id)
    }
  }

  stop(): void {
    this.#running = false
    this.#abort.abort()
    for (const timer of this.#timers.values()) clearTimeout(timer)
    this.#timers.clear()
    for (const accountId of [...this.#watches.keys()]) this.#unwatch(accountId)
  }

  startAccount(accountId: number): void {
    if (!this.#running) return
    this.#watch(getAccount(this.#db, accountId))
    if (this.#inRound.has(accountId)) return
    clearTimeout(this.#timers.get(accountId))
    this.#timers.delete(accountId)
    void this.#runLoop(accountId)
  }

  lookForGamesNow(accountId: number): void {
    const state = getSyncState(this.#db, accountId, LIBRARY_SCOPE)
    if (state) upsertSyncState(this.#db, accountId, LIBRARY_SCOPE, { ...state, nextDueAt: null })
    this.startAccount(accountId)
  }

  async refreshCredentials(accountId: number): Promise<typeof READY | Date | null> {
    const signal = this.#abort.signal
    const account = getAccount(this.#db, accountId)
    const provider = this.#providers[account.platform]
    if (!provider) return null
    if (!provider.refresh) return READY

    const key = String(account.id)
    const attemptKey = `${account.id}:refresh`
    let refreshed: AccountCredentials
    try {
      refreshed = await provider.refresh(this.#credentials(account), signal)
    } catch (err) {
      if (signal.aborted) return null
      const state = getSyncState(this.#db, account.id, LIBRARY_SCOPE)
      const outcome = this.#recordFailure(account, LIBRARY_SCOPE, attemptKey, state, err)
      return outcome === 'stop' ? null : outcome
    }

    this.#attempts.delete(attemptKey)
    if (refreshed.secret && refreshed.secret.expose() !== this.#secrets.find(key)?.expose()) {
      this.#secrets.save(key, refreshed.secret)
    }
    return READY
  }

  async syncLibrary(accountId: number): Promise<Date | null> {
    const account = getAccount(this.#db, accountId)
    const provider = this.#providers[account.platform]
    if (!provider) return null

    const state = getSyncState(this.#db, account.id, LIBRARY_SCOPE)
    if (state?.nextDueAt && state.nextDueAt > this.#now()) return state.nextDueAt
    return this.#fetchLibrary(account, provider, state)
  }

  async syncGameNow(accountId: number, gameId: string): Promise<void> {
    if (!this.#running) return
    const key = `${accountId}:${gameId}`
    if (this.#urgent.has(key)) {
      this.#urgent.set(key, true)
      return
    }

    try {
      do {
        this.#urgent.set(key, false)
        await this.#syncGameNow(accountId, gameId)
      } while (this.#running && this.#urgent.get(key))
    } catch (err) {
      console.error(`Syncing game ${gameId} for account ${accountId} failed`, err)
    } finally {
      this.#urgent.delete(key)
    }
  }

  async #syncGameNow(accountId: number, gameId: string): Promise<void> {
    const account = getAccount(this.#db, accountId)
    const provider = this.#providers[account.platform]
    if (!provider) return
    if (!(await this.#isListed(account, provider, gameId))) return

    const scope = `game:${gameId}`
    const state = getSyncState(this.#db, account.id, scope)
    if (this.#isBackingOff(state)) return
    await this.#syncGame(
      account,
      gameId,
      provider,
      this.#credentials(account),
      state,
      this.#abort.signal,
    )
  }

  async #isListed(
    account: AccountRow,
    provider: AchievementProvider,
    gameId: string,
  ): Promise<boolean> {
    const listed = (): boolean => listPlatformGameExternalIds(this.#db, account.id).includes(gameId)
    if (listed()) return true
    if (this.#unlisted.get(account.id)?.has(gameId)) return false

    const state = getSyncState(this.#db, account.id, LIBRARY_SCOPE)
    if (this.#isBackingOff(state)) return false
    await this.#fetchLibrary(account, provider, state)
    if (listed()) return true

    if (getSyncState(this.#db, account.id, LIBRARY_SCOPE)?.lastError === null) {
      const unlisted = this.#unlisted.get(account.id) ?? new Set<string>()
      unlisted.add(gameId)
      this.#unlisted.set(account.id, unlisted)
    }
    return false
  }

  #isBackingOff(state: SyncStateRow | null): boolean {
    return !!state?.lastError && !!state.nextDueAt && state.nextDueAt > this.#now()
  }

  async #fetchLibrary(
    account: AccountRow,
    provider: AchievementProvider,
    state: SyncStateRow | null,
  ): Promise<Date | null> {
    const signal = this.#abort.signal
    const attemptKey = `${account.id}:${LIBRARY_SCOPE}`
    let games: readonly RemoteGame[]
    try {
      games = await provider.listGames(this.#credentials(account), signal)
    } catch (err) {
      if (signal.aborted) return null
      const outcome = this.#recordFailure(account, LIBRARY_SCOPE, attemptKey, state, err)
      return outcome === 'stop' ? null : outcome
    }

    let added: number
    this.#db.exec('BEGIN')
    try {
      added = addPlatformGames(this.#db, account, games, state?.lastOkAt ?? null)
      this.#db.exec('COMMIT')
    } catch (err) {
      this.#db.exec('ROLLBACK')
      throw err
    }

    this.#recent.set(
      account.id,
      new Set(games.filter((game) => game.recentlyPlayed).map((game) => game.ref.externalId)),
    )
    this.#unlisted.delete(account.id)
    this.#attempts.delete(attemptKey)
    const nextDueAt = this.#after(this.#intervalMs)
    upsertSyncState(this.#db, account.id, LIBRARY_SCOPE, {
      cursor: state?.cursor ?? null,
      lastOkAt: this.#now(),
      lastError: null,
      nextDueAt,
    })
    if (added > 0) this.#onDataChanged()
    return nextDueAt
  }

  async syncDueGames(accountId: number): Promise<Date | null> {
    const signal = this.#abort.signal
    const account = getAccount(this.#db, accountId)
    const provider = this.#providers[account.platform]
    if (!provider) return null

    const credentials = this.#credentials(account)
    const recent = this.#recent.get(account.id)

    let earliest: Date | null = null
    for (const gameId of listPlatformGameExternalIds(this.#db, account.id)) {
      if (signal.aborted) return null

      const scope = `game:${gameId}`
      const isRecent = recent === undefined || recent.has(gameId)
      const state = getSyncState(this.#db, account.id, scope)
      let dueAt = this.#dueAt(state, isRecent)

      if (!dueAt || dueAt <= this.#now()) {
        const outcome = await this.#syncGame(account, gameId, provider, credentials, state, signal)
        if (outcome === 'stop') return null
        dueAt = this.#dueAt(getSyncState(this.#db, account.id, scope), isRecent) ?? outcome
      }

      if (!earliest || dueAt < earliest) earliest = dueAt
    }

    return earliest ?? this.#after(this.#intervalMs)
  }

  #watch(account: AccountRow): void {
    const provider = this.#providers[account.platform]
    if (!provider?.watch || this.#watches.has(account.id)) return
    const stop = provider.watch(
      this.#credentials(account),
      (game) => void this.syncGameNow(account.id, game.externalId),
    )
    this.#watches.set(account.id, stop)
  }

  #unwatch(accountId: number): void {
    this.#watches.get(accountId)?.()
    this.#watches.delete(accountId)
  }

  #credentials(account: AccountRow): AccountCredentials {
    return {
      platform: account.platform,
      externalId: account.externalId,
      secret: this.#secrets.find(String(account.id)) ?? null,
    }
  }

  #dueAt(state: SyncStateRow | null, isRecent: boolean): Date | null {
    const nextDueAt = state?.nextDueAt ?? null
    if (isRecent || !state?.lastOkAt) return nextDueAt
    const idleDueAt = new Date(state.lastOkAt.getTime() + IDLE_INTERVAL_MS)
    return nextDueAt && nextDueAt > idleDueAt ? nextDueAt : idleDueAt
  }

  async #syncGame(
    account: AccountRow,
    gameId: string,
    provider: AchievementProvider,
    credentials: AccountCredentials,
    previous: SyncStateRow | null,
    signal: AbortSignal,
  ): Promise<Date | 'stop'> {
    const scope = `game:${gameId}`
    const attemptKey = `${account.id}:${scope}`

    let events: UnlockEvent[]
    try {
      events = await runSyncPass(this.#db, account, gameId, provider, credentials, signal)
    } catch (err) {
      if (signal.aborted) return 'stop'
      return this.#recordFailure(account, scope, attemptKey, previous, err)
    }

    this.#attempts.delete(attemptKey)
    const nextDueAt = this.#after(this.#intervalMs)
    upsertSyncState(this.#db, account.id, scope, {
      cursor: previous?.cursor ?? null,
      lastOkAt: this.#now(),
      lastError: null,
      nextDueAt,
    })
    this.#onDataChanged()
    if (events.length > 0) this.#onUnlocks(events)
    return nextDueAt
  }

  #recordFailure(
    account: AccountRow,
    scope: string,
    attemptKey: string,
    previous: SyncStateRow | null,
    err: unknown,
  ): Date | 'stop' {
    const record = (nextDueAt: Date | null): void =>
      upsertSyncState(this.#db, account.id, scope, {
        cursor: previous?.cursor ?? null,
        lastOkAt: previous?.lastOkAt ?? null,
        lastError: err instanceof Error ? err.message : String(err),
        nextDueAt,
      })

    if (err instanceof ProviderError && err.kind === 'auth_expired') {
      setAccountStatus(this.#db, account.id, 'needs_reauth')
      this.#unwatch(account.id)
      record(null)
      this.#onDataChanged()
      return 'stop'
    }

    if (err instanceof ProviderError && err.isRetryable) {
      const attempt = this.#attempts.get(attemptKey) ?? 0
      this.#attempts.set(attemptKey, attempt + 1)
      const delay = withJitter(
        Math.max(err.retryAfterMs ?? 0, backoffDelayMs(attempt, BACKOFF_BASE_MS, BACKOFF_MAX_MS)),
        this.#random,
      )
      const nextDueAt = this.#after(delay)
      record(nextDueAt)
      return nextDueAt
    }

    const nextDueAt = this.#after(this.#intervalMs)
    record(nextDueAt)
    return nextDueAt
  }

  async #runLoop(accountId: number): Promise<void> {
    let next: Date | null
    this.#inRound.add(accountId)
    try {
      next = await this.#runRound(accountId)
    } catch (err) {
      console.error(`Sync round for account ${accountId} failed`, err)
      next = this.#after(this.#intervalMs)
    } finally {
      this.#inRound.delete(accountId)
    }

    if (!this.#running || next === null) {
      this.#timers.delete(accountId)
      return
    }
    const delay = Math.max(0, next.getTime() - this.#now().getTime())
    this.#timers.set(
      accountId,
      setTimeout(() => void this.#runLoop(accountId), delay),
    )
  }

  async #runRound(accountId: number): Promise<Date | null> {
    const refreshed = await this.refreshCredentials(accountId)
    if (refreshed !== READY) return refreshed
    const library = await this.syncLibrary(accountId)
    if (library === null) return null
    const games = await this.syncDueGames(accountId)
    if (games === null) return null
    return games < library ? games : library
  }

  #after(ms: number): Date {
    return new Date(this.#now().getTime() + ms)
  }
}
