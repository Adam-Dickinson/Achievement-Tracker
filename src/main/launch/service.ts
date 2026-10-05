import type { InstalledEntry, KnownGame, PlayResult } from '@shared/launch'
import { matchInstalled } from './match'
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
  #installs: readonly InstalledGame[] = []
  #scanning: Promise<void> | null = null

  constructor(deps: LaunchServiceDeps) {
    this.#adapters = deps.adapters
    this.#known = deps.known
    this.#start = deps.start
    this.#onChanged = deps.onChanged ?? (() => undefined)
  }

  scan(): Promise<void> {
    this.#scanning ??= this.#run().finally(() => {
      this.#scanning = null
    })
    return this.#scanning
  }

  installed(): InstalledEntry[] {
    return matchInstalled(this.#known(), this.#installs).map((match) => ({
      gameId: match.known.gameId,
      platformGameId: match.known.id,
      platform: match.known.platform,
    }))
  }

  async play(platformGameId: number): Promise<PlayResult> {
    const match = matchInstalled(this.#known(), this.#installs).find(
      (item) => item.known.id === platformGameId,
    )
    if (!match) return { ok: false, reason: 'That game is not installed.' }

    const result = await this.#start(match.target)
    if (!result.ok) void this.scan()
    return result
  }

  async #run(): Promise<void> {
    const found = await Promise.all(this.#adapters.map((adapter) => this.#find(adapter)))
    this.#installs = found.flat()
    this.#onChanged()
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
