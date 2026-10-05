import type { InstalledEntry, KnownGame, PlayResult } from '@shared/launch'
import { buildInstallIndex, matchWithIndex, type InstallIndex } from './match'
import type { InstallAdapter, InstalledGame, LaunchTarget } from './types'

export interface LaunchServiceDeps {
  readonly adapters: readonly InstallAdapter[]
  readonly known: () => readonly KnownGame[]
  readonly start: (target: LaunchTarget) => Promise<PlayResult>
  readonly onChanged?: () => void
}

export class LaunchService {
  readonly #adapters: readonly InstallAdapter[]
  readonly #known: () => readonly KnownGame[]
  readonly #start: (target: LaunchTarget) => Promise<PlayResult>
  readonly #onChanged: () => void
  #index: InstallIndex = buildInstallIndex([])
  #scanning: Promise<void> | null = null
  #again = false

  constructor(deps: LaunchServiceDeps) {
    this.#adapters = deps.adapters
    this.#known = deps.known
    this.#start = deps.start
    this.#onChanged = deps.onChanged ?? (() => undefined)
  }

  scan(): Promise<void> {
    if (this.#scanning) {
      this.#again = true
      return this.#scanning
    }
    this.#scanning = this.#runUntilSettled().finally(() => {
      this.#scanning = null
    })
    return this.#scanning
  }

  installed(): InstalledEntry[] {
    return matchWithIndex(this.#known(), this.#index).map((match) => ({
      gameId: match.known.gameId,
      platformGameId: match.known.id,
      platform: match.known.platform,
    }))
  }

  async play(platformGameId: number): Promise<PlayResult> {
    const match = matchWithIndex(this.#known(), this.#index).find(
      (item) => item.known.id === platformGameId,
    )
    if (!match) return { ok: false, reason: 'That game is not installed.' }

    const result = await this.#start(match.target)
    if (!result.ok) void this.scan()
    return result
  }

  async #runUntilSettled(): Promise<void> {
    do {
      this.#again = false
      await this.#run()
    } while (this.#again)
  }

  async #run(): Promise<void> {
    const found = await Promise.all(this.#adapters.map((adapter) => this.#find(adapter)))
    this.#index = buildInstallIndex(found.flat())
    try {
      this.#onChanged()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`Launch: could not announce the installed games (${reason})`)
    }
  }

  async #find(adapter: InstallAdapter): Promise<readonly InstalledGame[]> {
    try {
      return await adapter.findInstalled()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`Launch: could not list the ${adapter.platform} installs (${reason})`)
      return []
    }
  }
}
