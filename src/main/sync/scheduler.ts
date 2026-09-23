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

export const SYNC_INTERVAL_MS = 5 * 60_000

const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 30 * 60_000

export interface SchedulerDeps {
  readonly db: DatabaseSync
  readonly providers: Partial<Record<Platform, AchievementProvider>>
  readonly secrets: SecretStore
  readonly onUnlocks: (events: UnlockEvent[]) => void
  readonly intervalMs?: number
  readonly now?: () => Date
}

export class Scheduler {
  readonly #db: DatabaseSync
  readonly #providers: Partial<Record<Platform, AchievementProvider>>
  readonly #secrets: SecretStore
  readonly #onUnlocks: (events: UnlockEvent[]) => void
  readonly #intervalMs: number
  readonly #now: () => Date

  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>()
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

  start(): void {
    if (this.#running) return
    this.#running = true
    this.#abort = new AbortController()

    for (const account of listConnectedAccounts(this.#db)) {
      if (this.#providers[account.platform]) void this.#runLoop(account.id)
    }
  }

  stop(): void {
    this.#running = false
    this.#abort.abort()
    for (const timer of this.#timers.values()) clearTimeout(timer)
    this.#timers.clear()
  }

  async syncDueGames(accountId: number): Promise<Date | null> {
    const signal = this.#abort.signal
    const account = getAccount(this.#db, accountId)
    const provider = this.#providers[account.platform]
    if (!provider) return null

    const credentials: AccountCredentials = {
      platform: account.platform,
      externalId: account.externalId,
      secret: this.#secrets.find(String(account.id)) ?? null,
    }

    let earliest: Date | null = null
    for (const gameId of listPlatformGameExternalIds(this.#db, account.id)) {
      if (signal.aborted) return null

      const scope = `game:${gameId}`
      const state = getSyncState(this.#db, account.id, scope)
      let nextDueAt = state?.nextDueAt ?? null

      if (!nextDueAt || nextDueAt <= this.#now()) {
        const outcome = await this.#syncGame(account, gameId, provider, credentials, state, signal)
        if (outcome === 'stop') return null
        nextDueAt = outcome
      }

      if (!earliest || nextDueAt < earliest) earliest = nextDueAt
    }

    return earliest ?? this.#after(this.#intervalMs)
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
    const record = (nextDueAt: Date | null): void =>
      upsertSyncState(this.#db, account.id, scope, {
        cursor: previous?.cursor ?? null,
        lastOkAt: previous?.lastOkAt ?? null,
        lastError: err instanceof Error ? err.message : String(err),
        nextDueAt,
      })

    if (err instanceof ProviderError && err.kind === 'auth_expired') {
      setAccountStatus(this.#db, account.id, 'needs_reauth')
      record(null)
      return 'stop'
    }

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

    const nextDueAt = this.#after(this.#intervalMs)
    record(nextDueAt)
    return nextDueAt
  }

  async #runLoop(accountId: number): Promise<void> {
    let next: Date | null
    try {
      next = await this.syncDueGames(accountId)
    } catch (err) {
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
