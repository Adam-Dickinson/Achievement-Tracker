import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  type UpdateSettings,
  type UpdateState,
} from '@shared/updates'
import { UpdateService, type UpdaterLike } from './update-service'

const NOW = new Date('2026-10-02T12:00:00.000Z')

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn((): Promise<unknown> => Promise.resolve(undefined))
  downloadUpdate = vi.fn((): Promise<unknown> => Promise.resolve(undefined))
  quitAndInstall = vi.fn()
}

let updater: FakeUpdater
let stored: UpdateSettings
let visible: boolean
const notify = vi.fn<(version: string) => void>()
const changes: UpdateState[] = []

beforeEach(() => {
  vi.useFakeTimers()
  updater = new FakeUpdater()
  stored = { autoCheck: true, dismissedVersion: null, notifiedVersion: null }
  visible = false
  notify.mockReset()
  changes.length = 0
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function service(updaterOverride: UpdaterLike | null = updater): UpdateService {
  return new UpdateService({
    updater: updaterOverride,
    currentVersion: '1.0.0',
    settings: {
      read: () => stored,
      save: (patch) => {
        stored = { ...stored, ...patch }
      },
    },
    windowVisible: () => visible,
    notify,
    onChange: (state) => changes.push(state),
    now: () => NOW,
  })
}

function foundUpdate(version = '1.1.0'): void {
  updater.checkForUpdates.mockImplementation(() => {
    updater.emit('update-available', { version })
    return Promise.resolve(undefined)
  })
}

describe('UpdateService', () => {
  it('is disabled when there is no updater, and never checks', async () => {
    const disabled = service(null)

    disabled.start()
    const state = await disabled.checkNow()

    expect(state.status).toBe('disabled')
    expect(state.currentVersion).toBe('1.0.0')
  })

  it('tells the updater never to download by itself', () => {
    service()

    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(true)
  })

  it('starts idle with nothing known', () => {
    expect(service().state()).toEqual({
      status: 'idle',
      currentVersion: '1.0.0',
      version: null,
      percent: null,
      message: null,
      lastCheckedAt: null,
      autoCheck: true,
      dismissed: false,
    })
  })

  it('checks once shortly after start, then every six hours', async () => {
    service().start()

    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS - 1)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('does not check by itself when automatic checking is off, but still checks on request', async () => {
    stored = { ...stored, autoCheck: false }
    const off = service()

    off.start()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()

    await off.checkNow()
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('stops its timers', async () => {
    const running = service()

    running.start()
    running.stop()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2)

    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('reports an update as available without downloading it', async () => {
    foundUpdate('1.1.0')
    const found = service()

    const state = await found.checkNow()

    expect(state).toMatchObject({
      status: 'available',
      version: '1.1.0',
      lastCheckedAt: '2026-10-02T12:00:00.000Z',
      dismissed: false,
    })
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    expect(changes.map((change) => change.status)).toContain('available')
  })

  it('goes back to idle, with the check time, when there is no update', async () => {
    updater.checkForUpdates.mockImplementation(() => {
      updater.emit('update-not-available', { version: '1.0.0' })
      return Promise.resolve(undefined)
    })

    const state = await service().checkNow()

    expect(state).toMatchObject({
      status: 'idle',
      version: null,
      lastCheckedAt: '2026-10-02T12:00:00.000Z',
    })
  })

  it('runs only one check at a time', async () => {
    let finish: () => void = () => undefined
    updater.checkForUpdates.mockImplementation(
      () => new Promise<unknown>((resolve) => (finish = () => resolve(undefined))),
    )
    const busy = service()

    const first = busy.checkNow()
    const second = busy.checkNow()
    finish()
    await Promise.all([first, second])

    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  })

  describe('telling the user', () => {
    it('sends one system notification per version when the window is hidden', async () => {
      foundUpdate('1.1.0')
      const hidden = service()

      await hidden.checkNow()
      await hidden.checkNow()

      expect(notify).toHaveBeenCalledOnce()
      expect(notify).toHaveBeenCalledWith('1.1.0')
      expect(stored.notifiedVersion).toBe('1.1.0')
    })

    it('does not repeat the notification after a restart', async () => {
      foundUpdate('1.1.0')
      await service().checkNow()
      notify.mockReset()

      await service().checkNow()

      expect(notify).not.toHaveBeenCalled()
    })

    it('notifies again for a newer version', async () => {
      foundUpdate('1.1.0')
      const again = service()
      await again.checkNow()
      foundUpdate('1.2.0')

      await again.checkNow()

      expect(notify.mock.calls.map(([version]) => version)).toEqual(['1.1.0', '1.2.0'])
    })

    it('does not notify while the window is visible, and does not save it as told', async () => {
      visible = true
      foundUpdate('1.1.0')

      await service().checkNow()

      expect(notify).not.toHaveBeenCalled()
      expect(stored.notifiedVersion).toBe('1.1.0')
    })

    it('does not notify for a version the user dismissed', async () => {
      stored = { ...stored, dismissedVersion: '1.1.0' }
      foundUpdate('1.1.0')

      const state = await service().checkNow()

      expect(notify).not.toHaveBeenCalled()
      expect(state.dismissed).toBe(true)
    })
  })

  describe('dismissing', () => {
    it('remembers the dismissed version, and a newer one is not dismissed', async () => {
      foundUpdate('1.1.0')
      const dismissing = service()
      await dismissing.checkNow()

      const dismissed = dismissing.dismiss()
      foundUpdate('1.2.0')
      const newer = await dismissing.checkNow()

      expect(dismissed.dismissed).toBe(true)
      expect(stored.dismissedVersion).toBe('1.1.0')
      expect(newer.dismissed).toBe(false)
    })

    it('does nothing when there is no update to dismiss', () => {
      expect(service().dismiss().dismissed).toBe(false)
      expect(stored.dismissedVersion).toBeNull()
    })
  })

  describe('downloading and installing', () => {
    it('downloads only when asked, reports progress, and ends ready', async () => {
      foundUpdate('1.1.0')
      const downloading = service()
      await downloading.checkNow()

      const started = downloading.download()
      updater.emit('download-progress', { percent: 41.6 })
      expect(downloading.state()).toMatchObject({ status: 'downloading', percent: 42 })
      updater.emit('update-downloaded', { version: '1.1.0' })
      await started

      expect(updater.downloadUpdate).toHaveBeenCalledOnce()
      expect(downloading.state()).toMatchObject({ status: 'ready', version: '1.1.0', percent: 100 })
    })

    it('ignores a download request when no update is available', async () => {
      await service().download()

      expect(updater.downloadUpdate).not.toHaveBeenCalled()
    })

    it('installs only a downloaded update', async () => {
      foundUpdate('1.1.0')
      const installing = service()
      await installing.checkNow()

      installing.install()
      expect(updater.quitAndInstall).not.toHaveBeenCalled()

      await installing.download()
      updater.emit('update-downloaded', { version: '1.1.0' })
      installing.install()
      expect(updater.quitAndInstall).toHaveBeenCalledOnce()
    })

    it('does not run an automatic check while an update is ready', async () => {
      foundUpdate('1.1.0')
      const ready = service()
      await ready.checkNow()
      await ready.download()
      updater.emit('update-downloaded', { version: '1.1.0' })
      updater.checkForUpdates.mockClear()

      ready.start()
      await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)

      expect(updater.checkForUpdates).not.toHaveBeenCalled()
      expect(ready.state().status).toBe('ready')
    })
  })

  describe('failing', () => {
    it('reports a failed check as an error and does not throw', async () => {
      updater.checkForUpdates.mockRejectedValue(new Error('offline'))

      const state = await service().checkNow()

      expect(state).toMatchObject({
        status: 'error',
        message: 'Could not check for updates.',
      })
    })

    it('reports a failed download as an error', async () => {
      foundUpdate('1.1.0')
      const failing = service()
      await failing.checkNow()
      updater.downloadUpdate.mockRejectedValue(new Error('disk full'))

      const state = await failing.download()

      expect(state).toMatchObject({
        status: 'error',
        message: 'Could not download the update.',
      })
    })

    it('lets a later check succeed after an error', async () => {
      updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
      const retrying = service()
      await retrying.checkNow()
      foundUpdate('1.1.0')

      const state = await retrying.checkNow()

      expect(state.status).toBe('available')
      expect(state.message).toBeNull()
    })
  })

  it('saves the automatic-check switch and reports it', () => {
    const switching = service()

    const state = switching.setAutoCheck(false)

    expect(stored.autoCheck).toBe(false)
    expect(state.autoCheck).toBe(false)
    expect(changes.at(-1)?.autoCheck).toBe(false)
  })
})
