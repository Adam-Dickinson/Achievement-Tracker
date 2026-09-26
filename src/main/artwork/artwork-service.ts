import type { DatabaseSync } from 'node:sqlite'
import { ProviderError } from '@shared/errors'
import type { ArtworkKeyResult, ArtworkProblem, ArtworkRun } from '@shared/ipc'
import { Secret } from '@shared/secret'
import type { SecretStore } from '@shared/secret-store'
import { listArtworkWanted, saveArtwork } from '../store/artwork-store'
import { listGrids, pickGame, pickGrid, searchGames } from './steamgriddb'

export const ARTWORK_SECRET = 'steamgriddb'
export const RETRY_AFTER_MS = 30 * 24 * 60 * 60_000
const PAUSE_MS = 300
const KEY_CHECK_TITLE = 'Portal'

export interface ArtworkServiceDeps {
  readonly db: DatabaseSync
  readonly secrets: SecretStore
  readonly onFound: () => void
  readonly now?: () => Date
  readonly pauseMs?: number
}

export async function lookUpArtwork(
  title: string,
  key: Secret,
  signal?: AbortSignal,
): Promise<string | null> {
  const game = pickGame(await searchGames(title, key, signal), title)
  return game ? pickGrid(await listGrids(game.id, key, signal)) : null
}

export class ArtworkService {
  readonly #deps: ArtworkServiceDeps
  readonly #now: () => Date
  #running: Promise<ArtworkRun> | null = null
  #problem: ArtworkProblem = null
  #abort = new AbortController()

  constructor(deps: ArtworkServiceDeps) {
    this.#deps = deps
    this.#now = deps.now ?? (() => new Date())
  }

  get problem(): ArtworkProblem {
    return this.#problem
  }

  hasKey(): boolean {
    return this.#deps.secrets.find(ARTWORK_SECRET) !== undefined
  }

  async saveKey(value: string): Promise<ArtworkKeyResult> {
    const key = new Secret(value)
    try {
      await searchGames(KEY_CHECK_TITLE, key, this.#abort.signal)
    } catch (error) {
      return keyFailure(error)
    }
    this.#deps.secrets.save(ARTWORK_SECRET, key)
    this.#problem = null
    void this.run()
    return { ok: true }
  }

  removeKey(): void {
    this.#deps.secrets.delete(ARTWORK_SECRET)
    this.#problem = null
  }

  run(): Promise<ArtworkRun> {
    this.#running ??= this.#runNow().finally(() => {
      this.#running = null
    })
    return this.#running
  }

  stop(): void {
    this.#abort.abort()
    this.#abort = new AbortController()
  }

  async #runNow(): Promise<ArtworkRun> {
    const key = this.#deps.secrets.find(ARTWORK_SECRET)
    if (!key) return { found: 0, checked: 0 }
    const signal = this.#abort.signal
    const wanted = listArtworkWanted(
      this.#deps.db,
      new Date(this.#now().getTime() - RETRY_AFTER_MS),
    )

    let found = 0
    let checked = 0
    this.#problem = null
    for (const game of wanted) {
      if (signal.aborted) break
      let url: string | null
      try {
        url = await lookUpArtwork(game.title, key, signal)
      } catch (error) {
        if (signal.aborted) break
        const problem = problemFor(error)
        if (problem) {
          this.#problem = problem
          break
        }
        url = null
      }
      saveArtwork(this.#deps.db, game.matchKey, url, this.#now())
      checked++
      if (url) found++
      await pause(this.#deps.pauseMs ?? PAUSE_MS)
    }

    if (found > 0) this.#deps.onFound()
    return { found, checked }
  }
}

function problemFor(error: unknown): ArtworkProblem {
  if (!(error instanceof ProviderError)) return null
  if (error.kind === 'auth_expired') return 'key_refused'
  if (error.isRetryable) return 'unreachable'
  return null
}

function keyFailure(error: unknown): ArtworkKeyResult {
  const problem = problemFor(error)
  if (problem === 'key_refused') {
    return {
      ok: false,
      reason: 'key_rejected',
      message: 'SteamGridDB refused that key. Check it and try again.',
    }
  }
  if (problem === 'unreachable') {
    return {
      ok: false,
      reason: 'network',
      message: "Couldn't reach SteamGridDB. Check your connection and try again.",
    }
  }
  return {
    ok: false,
    reason: 'other',
    message: 'SteamGridDB gave an unexpected answer. Try again later.',
  }
}

function pause(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}
