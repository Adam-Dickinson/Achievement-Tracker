import type { DatabaseSync } from 'node:sqlite'
import { ProviderError } from '@shared/errors'
import type { AccountCredentials, UnlockEvent } from '@shared/models'
import type { Platform } from '@shared/platform'
import type { AchievementProvider } from '@shared/provider'
import type { SecretStore } from '@shared/secret-store'
import {
  type AccountRow,
  getAccount,
  getSyncState,
  listConnectedAccounts,
  listPlatformGameExternalIds,
  setAccountStatus,
  type SyncStateRow,
  upsertSyncState,
} from '../store/sync-store'
import { backoffDelayMs } from './backoff'
import { runSyncPass } from './sync-pass'

/** How often a game is synced when all is well: SPEC §7's `sync.intervalSec` default, until settings exist. */
export const SYNC_INTERVAL_MS = 5 * 60_000

// Retryable failures (network, rate limits) back off from 30 seconds up to 30 minutes.
const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 30 * 60_000

export interface SchedulerDeps {
  readonly db: DatabaseSync
  /** The provider for each platform. A platform with none registered is not synced. */
  readonly providers: Partial<Record<Platform, AchievementProvider>>
  readonly secrets: SecretStore
  /** Receives the unlocks a pass found, after they have been committed. Must not throw. */
  readonly onUnlocks: (events: UnlockEvent[]) => void
  readonly intervalMs?: number
  /** The clock. Tests pass a fake one. */
  readonly now?: () => Date
}

/**
 * Decides when each game is synced (docs/SPEC.md §5); `runSyncPass` decides what a sync does.
 * Each connected account gets its own loop (ARCHITECTURE §4), so a failing or slow provider
 * can't hold up another account.
 */
export class Scheduler {
  readonly #db: DatabaseSync
  readonly #providers: Partial<Record<Platform, AchievementProvider>>
  readonly #secrets: SecretStore
  readonly #onUnlocks: (events: UnlockEvent[]) => void
  readonly #intervalMs: number
  readonly #now: () => Date

  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>()
  // Consecutive retryable failures per `${accountId}:${scope}`. Kept in memory only (the schema
  // has no column for it), so a restart simply starts the backoff again.
  readonly #attempts = new Map<string, number>()
  #abort = new AbortController()
  #running = false

  constructor(deps: SchedulerDeps) {
    this.#db = deps.db
    this.#providers = deps.providers
    this.#secrets = deps.secrets
    this.#onUnlocks = deps.onUnlocks
    this.#intervalMs = deps.intervalMs ?? SYNC_INTERVAL_MS
    this.#now = deps.now ?? (() => new Date())
  }

  /** Starts a loop for every connected account that has a provider. */
  start(): void {
    if (this.#running) return
    this.#running = true
    this.#abort = new AbortController()

    for (const account of listConnectedAccounts(this.#db)) {
      if (this.#providers[account.platform]) void this.#runLoop(account.id)
    }
  }

  /** Stops every loop and cancels any provider call in flight (on quit). */
  stop(): void {
    this.#running = false
    this.#abort.abort()
    for (const timer of this.#timers.values()) clearTimeout(timer)
    this.#timers.clear()
  }

  /**
   * One round for one account: syncs each of its games that is due and records the outcome.
   * Returns when the account next needs attention, or `null` if it should no longer be polled
   * (no provider, it needs re-login, or the scheduler was stopped).
   */
  async syncDueGames(accountId: number): Promise<Date | null> {
    // Captured now, so a stop() during this round is still seen after a later start().
    const signal = this.#abort.signal
    const account = getAccount(this.#db, accountId)
    const provider = this.#providers[account.platform]
    if (!provider) return null

    const credentials: AccountCredentials = {
      platform: account.platform,
      externalId: account.externalId,
      secret: this.#secrets.find(String(account.id)) ?? null, // SPEC §3: keyed by account id
    }

    let earliest: Date | null = null
    for (const gameId of listPlatformGameExternalIds(this.#db, account.id)) {
      if (signal.aborted) return null

      const scope = `game:${gameId}`
      const state = getSyncState(this.#db, account.id, scope)
      // No row, or no due time, means it has never synced: due now.
      let nextDueAt = state?.nextDueAt ?? null

      if (!nextDueAt || nextDueAt <= this.#now()) {
        const outcome = await this.#syncGame(account, gameId, provider, credentials, state, signal)
        if (outcome === 'stop') return null
        nextDueAt = outcome
      }

      if (!earliest || nextDueAt < earliest) earliest = nextDueAt
    }

    // An account with no games yet is checked again after a normal interval.
    return earliest ?? this.#after(this.#intervalMs)
  }

  /** Syncs one game and records the outcome. Returns its next due time, or 'stop'. */
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
      if (signal.aborted) return 'stop' // cancelled by stop(): not a failure worth recording
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
    // Keep the last success and cursor; only the error and the next attempt change.
    const record = (nextDueAt: Date | null): void =>
      upsertSyncState(this.#db, account.id, scope, {
        cursor: previous?.cursor ?? null,
        lastOkAt: previous?.lastOkAt ?? null,
        lastError: err instanceof Error ? err.message : String(err),
        nextDueAt,
      })

    // A dead login can't succeed on retry. Mark the account so the UI can ask for a reconnect,
    // and stop polling it; reconnecting starts it again. No due time, so it syncs straight away.
    if (err instanceof ProviderError && err.kind === 'auth_expired') {
      setAccountStatus(this.#db, account.id, 'needs_reauth')
      record(null)
      return 'stop'
    }

    // Network trouble or rate limiting: back off exponentially, or longer if the platform asked.
    if (err instanceof ProviderError && err.isRetryable) {
      const attempt = this.#attempts.get(attemptKey) ?? 0
      this.#attempts.set(attemptKey, attempt + 1)
      const delay = Math.max(
        err.retryAfterMs ?? 0,
        backoffDelayMs(attempt, BACKOFF_BASE_MS, BACKOFF_MAX_MS),
      )
      const nextDueAt = this.#after(delay)
      record(nextDueAt)
      return nextDueAt
    }

    // Anything else (a parse error, unsupported, a bug): retrying sooner won't help, but a later
    // fix or data change might, so try again at the normal pace.
    const nextDueAt = this.#after(this.#intervalMs)
    record(nextDueAt)
    return nextDueAt
  }

  /** Runs one round for an account, then schedules the next. Never lets an error escape. */
  async #runLoop(accountId: number): Promise<void> {
    let next: Date | null
    try {
      next = await this.syncDueGames(accountId)
    } catch (err) {
      // Supervised (ARCHITECTURE §4): an unexpected error, such as a database problem, must not
      // end this account's polling. Sync failures are already in sync_state.last_error; this is
      // for everything else. Replace with the app logger once it exists (SPEC §10).
      console.error(`Sync round for account ${accountId} failed`, err)
      next = this.#after(this.#intervalMs)
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

  #after(ms: number): Date {
    return new Date(this.#now().getTime() + ms)
  }
}
