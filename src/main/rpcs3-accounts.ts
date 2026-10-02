import { basename, dirname, resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { ProviderError } from '@shared/errors'
import type {
  ChooseEmulatorFolderResult,
  ConnectResult,
  EmulatorConnectInput,
  EmulatorFolder,
} from '@shared/ipc'
import type { AchievementProvider } from '@shared/provider'
import type { SecretStore } from '@shared/secret-store'
import { saveAccount } from './accounts'
import type { LocalFiles } from './providers/local-files'
import { accountExternalId, defaultDataDirs, isDataDir, listUsers } from './providers/rpcs3/local'
import type { Scheduler } from './sync/scheduler'

export interface Rpcs3AccountsDeps {
  readonly db: DatabaseSync
  readonly rpcs3: AchievementProvider
  readonly secrets: SecretStore
  readonly scheduler: Pick<Scheduler, 'startAccount'>
  readonly files: LocalFiles
  readonly chooseFolder: () => Promise<string | null>
  readonly defaultDirs?: () => string[]
}

export class Rpcs3Accounts {
  readonly #deps: Rpcs3AccountsDeps
  readonly #offered = new Set<string>()

  constructor(deps: Rpcs3AccountsDeps) {
    this.#deps = deps
  }

  async find(): Promise<EmulatorFolder | null> {
    for (const dir of (this.#deps.defaultDirs ?? defaultDataDirs)()) {
      const folder = await this.#offer(dir)
      if (folder) return folder
    }
    return null
  }

  async choose(): Promise<ChooseEmulatorFolderResult> {
    const chosen = await this.#deps.chooseFolder()
    if (chosen === null) return { kind: 'cancelled' }
    const candidates = basename(chosen).toLowerCase() === 'dev_hdd0' ? [dirname(chosen)] : [chosen]
    for (const dir of candidates) {
      const folder = await this.#offer(dir)
      if (folder) return { kind: 'chosen', folder }
    }
    return { kind: 'not_found', path: chosen }
  }

  async connect(input: EmulatorConnectInput): Promise<ConnectResult> {
    const dataDir = resolve(input.path)
    if (!this.#offered.has(dataDir)) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: 'Choose the RPCS3 folder again, then connect.',
      }
    }
    try {
      const credentials = await this.#deps.rpcs3.authenticate({
        kind: 'local_path',
        path: accountExternalId({ dataDir, userId: input.userId }),
      })
      const profile = await this.#deps.rpcs3.validate(credentials)
      return { ok: true, account: saveAccount(this.#deps, credentials, profile.displayName) }
    } catch (err) {
      if (err instanceof ProviderError) return { ok: false, reason: 'other', message: err.message }
      console.error('Connecting RPCS3 failed', err)
      return {
        ok: false,
        reason: 'other',
        message: 'Something went wrong while connecting. Please try again.',
      }
    }
  }

  async #offer(dir: string): Promise<EmulatorFolder | null> {
    const path = resolve(dir)
    if (!(await isDataDir(this.#deps.files, path))) return null
    this.#offered.add(path)
    return { path, users: await listUsers(this.#deps.files, path) }
  }
}
