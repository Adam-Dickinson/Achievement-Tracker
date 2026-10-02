import {
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  type UpdateSettings,
  type UpdateState,
  type UpdateStatus,
} from '@shared/updates'

export interface UpdateInfoLike {
  readonly version: string
}

export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'update-not-available', listener: (info: UpdateInfoLike) => void): unknown
  on(
    event: 'update-available' | 'update-downloaded',
    listener: (info: UpdateInfoLike) => void,
  ): unknown
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void
}

export interface UpdateServiceDeps {
  readonly updater: UpdaterLike | null
  readonly currentVersion: string
  readonly settings: {
    read(): UpdateSettings
    save(patch: Partial<UpdateSettings>): void
  }
  readonly windowVisible: () => boolean
  readonly notify: (version: string) => void
  readonly onChange: (state: UpdateState) => void
  readonly now?: () => Date
}

export function trayUpdateLabel(state: UpdateState): string | null {
  if (state.version === null) return null
  if (state.status === 'ready') return `Restart to update to v${state.version}`
  if (state.status === 'available') return `Update available: v${state.version}`
  return null
}

const CHECK_FAILED = 'Could not check for updates.'
const DOWNLOAD_FAILED = 'Could not download the update.'

export class UpdateService {
  readonly #deps: UpdateServiceDeps
  #status: UpdateStatus
  #version: string | null = null
  #percent: number | null = null
  #message: string | null = null
  #lastCheckedAt: string | null = null
  #first: ReturnType<typeof setTimeout> | null = null
  #every: ReturnType<typeof setInterval> | null = null

  constructor(deps: UpdateServiceDeps) {
    this.#deps = deps
    this.#status = deps.updater ? 'idle' : 'disabled'
    if (deps.updater) {
      deps.updater.autoDownload = false
      deps.updater.autoInstallOnAppQuit = true
      this.#listen(deps.updater)
    }
  }

  start(): void {
    if (!this.#deps.updater) return
    this.stop()
    this.#first = setTimeout(() => void this.#automatic(), FIRST_CHECK_DELAY_MS)
    this.#every = setInterval(() => void this.#automatic(), CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.#first) clearTimeout(this.#first)
    if (this.#every) clearInterval(this.#every)
    this.#first = null
    this.#every = null
  }

  state(): UpdateState {
    const settings = this.#deps.settings.read()
    return {
      status: this.#status,
      currentVersion: this.#deps.currentVersion,
      version: this.#version,
      percent: this.#percent,
      message: this.#message,
      lastCheckedAt: this.#lastCheckedAt,
      autoCheck: settings.autoCheck,
      dismissed: this.#version !== null && settings.dismissedVersion === this.#version,
    }
  }

  async checkNow(): Promise<UpdateState> {
    await this.#check()
    return this.state()
  }

  async download(): Promise<UpdateState> {
    const updater = this.#deps.updater
    if (!updater || !this.#canDownload()) return this.state()
    this.#percent = 0
    this.#set('downloading')
    try {
      await updater.downloadUpdate()
    } catch (error) {
      this.#fail(DOWNLOAD_FAILED, error)
    }
    return this.state()
  }

  install(): void {
    if (this.#status === 'ready') this.#deps.updater?.quitAndInstall(true, true)
  }

  dismiss(): UpdateState {
    if (this.#version !== null) {
      this.#deps.settings.save({ dismissedVersion: this.#version })
      this.#deps.onChange(this.state())
    }
    return this.state()
  }

  setAutoCheck(on: boolean): UpdateState {
    this.#deps.settings.save({ autoCheck: on })
    const state = this.state()
    this.#deps.onChange(state)
    return state
  }

  #canDownload(): boolean {
    return this.#status === 'available' || (this.#status === 'error' && this.#version !== null)
  }

  async #automatic(): Promise<void> {
    try {
      if (this.#deps.settings.read().autoCheck) await this.#check()
    } catch (error) {
      console.warn('Update problem', error)
    }
  }

  async #check(): Promise<void> {
    const updater = this.#deps.updater
    if (!updater || ['checking', 'downloading', 'ready'].includes(this.#status)) return
    this.#message = null
    this.#set('checking')
    try {
      await updater.checkForUpdates()
    } catch (error) {
      this.#fail(CHECK_FAILED, error)
      return
    }
    if (this.#status === 'checking') this.#set('idle')
  }

  #listen(updater: UpdaterLike): void {
    updater.on('update-available', (info) => {
      this.#version = info.version
      this.#percent = null
      this.#lastCheckedAt = this.#timestamp()
      this.#set('available')
      this.#announce(info.version)
    })
    updater.on('update-not-available', () => {
      this.#version = null
      this.#lastCheckedAt = this.#timestamp()
      this.#set('idle')
    })
    updater.on('download-progress', (progress) => {
      this.#percent = Math.round(progress.percent)
      this.#set('downloading')
    })
    updater.on('update-downloaded', (info) => {
      this.#version = info.version
      this.#percent = 100
      this.#set('ready')
    })
    updater.on('error', (error) => {
      this.#fail(this.#status === 'downloading' ? DOWNLOAD_FAILED : CHECK_FAILED, error)
    })
  }

  #announce(version: string): void {
    const settings = this.#deps.settings.read()
    if (settings.dismissedVersion === version || settings.notifiedVersion === version) return
    this.#deps.settings.save({ notifiedVersion: version })
    if (!this.#deps.windowVisible()) this.#deps.notify(version)
  }

  #fail(message: string, error: unknown): void {
    console.warn('Update problem', error)
    this.#message = message
    this.#set('error')
  }

  #timestamp(): string {
    return (this.#deps.now?.() ?? new Date()).toISOString()
  }

  #set(status: UpdateStatus): void {
    this.#status = status
    try {
      this.#deps.onChange(this.state())
    } catch (error) {
      console.warn('Update change listener failed', error)
    }
  }
}
