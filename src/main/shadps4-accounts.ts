import { join, resolve } from 'node:path'
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
import { accountExternalId, defaultDataDirs, isDataDir, listUsers } from './providers/shadps4/local'
import type { Scheduler } from './sync/scheduler'

export interface ShadPs4AccountsDeps {
  readonly db: DatabaseSync
  readonly shadps4: AchievementProvider
  readonly secrets: SecretStore
  readonly scheduler: Pick<Scheduler, 'startAccount'>
  readonly files: LocalFiles
  readonly chooseFolder: () => Promise<string | null>
  readonly env?: NodeJS.ProcessEnv
}

export class ShadPs4Accounts {
  readonly #deps: ShadPs4AccountsDeps
  readonly #offered = new Set<string>()

  constructor(deps: ShadPs4AccountsDeps) {
    this.#deps = deps
  }

  async find(): Promise<EmulatorFolder | null> {
    for (const dir of defaultDataDirs(this.#deps.env)) {
      const folder = await this.#offer(dir)
      if (folder) return folder
    }
    return null
  }

  async choose(): Promise<ChooseEmulatorFolderResult> {
    const chosen = await this.#deps.chooseFolder()
    if (chosen === null) return { kind: 'cancelled' }
    for (const dir of [chosen, join(chosen, 'user')]) {
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
        message: 'Choose the shadPS4 folder again, then connect.',
      }
    }
    try {
      const credentials = await this.#deps.shadps4.authenticate({
        kind: 'local_path',
        path: accountExternalId({ dataDir, userId: input.userId }),
      })
      const profile = await this.#deps.shadps4.validate(credentials)
      return { ok: true, account: saveAccount(this.#deps, credentials, profile.displayName) }
    } catch (err) {
      if (err instanceof ProviderError) return { ok: false, reason: 'other', message: err.message }
      console.error('Connecting shadPS4 failed', err)
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
