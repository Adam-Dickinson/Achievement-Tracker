# v1 release engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-user Windows installer built by a tagged GitHub Actions release, a notify-only update check (banner, tray entry, system notification, Settings card), and a measured v1.0.0.

**Architecture:** electron-builder packages `out/**` into an NSIS installer and publishes a draft GitHub Release. `electron-updater` runs behind an injectable `UpdateService` in the main process (a state machine that never downloads until asked). One no-payload IPC family plus a push event carries state to a banner in the app shell and a Settings card.

**Tech Stack:** electron-builder 26, electron-updater 6, TypeScript strict, React, Vitest, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-10-02-release-engineering-design.md](../specs/2026-10-02-release-engineering-design.md)

## Global Constraints

- No code comments (owner's choice). Explanations go in `docs/PROJECT-MAP.md`. An empty `catch {}` is a lint error: write `catch { return }`.
- Prettier: no semicolons, single quotes. `npm run lint` allows zero warnings. TypeScript strict, `noUncheckedIndexedAccess`, no `any`.
- Windows only, unsigned, GitHub Releases, notify-only updates (nothing downloads until the user asks). Updates are disabled when the app is not packaged.
- New renderer capabilities go `shared/ipc.ts`, then `main/ipc.ts` (validate the sender and payload), then `preload/index.ts` (rule 9). The renderer sends no paths and no versions.
- Secrets: the workflow uses only the built-in `GITHUB_TOKEN`; nothing is added to the repo.
- Styling: Tailwind utilities with design tokens that exist in `src/renderer/src/styles/index.css`, no hard-coded hex. Never name a colour token `base`, `sm`, `lg`, `xl`.
- Tests are written by Claude and must not depend on locale (CI is `en-US`, local is `en-ZA`): never assert a formatted date or number.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Ruling carried from planning: with **Automatically check for updates** off, the state is `idle`, not `disabled`; `disabled` means only "not packaged". The spec's wording said both; the Updates card shows the switch state separately, so one status is enough. Task 6 amends the spec.

---

### Task 1: Dependencies, installer configuration and scripts

**Files:**
- Modify: `package.json`, `package-lock.json`
- Verify (no commit of output): `release/win-unpacked/`

**Interfaces:**
- Produces: `npm run dist` (installer), `npm run dist:dir` (unpacked, `release/win-unpacked/Trophy Locker.exe`), the `electron-updater` runtime dependency used by Task 3.

- [ ] **Step 1: Install**

Run: `npm install electron-updater` and `npm install -D electron-builder`
Expected: both added (`electron-updater` to `dependencies`, `electron-builder` to `devDependencies`) and the lockfile updated. Do not change any other dependency version.

- [ ] **Step 2: Add the scripts and build config**

In `package.json` add to `scripts` (after `"build"`):

```json
    "dist": "npm run build && electron-builder --win --publish never",
    "dist:dir": "npm run build && electron-builder --win --dir --publish never",
```

and add this top-level key (after `"main"`; it is separate from `scripts.build`):

```json
  "build": {
    "appId": "io.github.adam-dickinson.trophy-locker",
    "productName": "Trophy Locker",
    "copyright": "Copyright (c) 2026 Adam Dickinson",
    "directories": { "output": "release" },
    "files": ["out/**", "package.json"],
    "win": { "target": "nsis", "icon": "resources/icon.ico" },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "shortcutName": "Trophy Locker",
      "artifactName": "Trophy-Locker-Setup-${version}.exe"
    },
    "publish": {
      "provider": "github",
      "owner": "Adam-Dickinson",
      "repo": "Achievement-Tracker",
      "releaseType": "draft"
    }
  },
```

- [ ] **Step 3: Build the unpacked app and check it**

Run: `npm run dist:dir`
Expected: `release/win-unpacked/Trophy Locker.exe` exists and the command exits 0. Then run (PowerShell) `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; & "release/win-unpacked/Trophy Locker.exe" --hidden`, wait 10 seconds, check with `Get-Process "Trophy Locker"` that it is running, then stop it with `Get-Process "Trophy Locker" | Stop-Process`. A tray icon and a running process mean the packaged app starts.

If electron-builder fails with a symbolic-link error while extracting `winCodeSign` ("Cannot create symbolic link"), that is the known Windows limit without Developer Mode: **stop and report BLOCKED** with the exact message. Do not turn off `signAndEditExecutable` or otherwise change the config to get around it.

- [ ] **Step 4: Build the installer**

Run: `npm run dist`
Expected: `release/Trophy-Locker-Setup-0.1.0.exe` exists. Record its size in MB in your report (SPEC N-05 target is under 120 MB). Do not run the installer.

- [ ] **Step 5: Check and commit**

Run: `npm run format:check && npm run lint && npm run typecheck && git status --short`
Expected: clean checks; `release/` must NOT appear in `git status` (it is git-ignored; if it appears, stop and report).

```bash
git add package.json package-lock.json
git commit -m "Add electron-builder, electron-updater and the dist scripts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The update state machine and its saved settings

**Files:**
- Create: `src/shared/updates.ts`
- Create: `src/main/update-service.ts`
- Test: `src/main/update-service.test.ts`
- Modify: `src/main/store/settings-store.ts`, `src/main/store/settings-store.test.ts`

**Interfaces:**
- Produces (`src/shared/updates.ts`): `UPDATE_STATUSES`, `type UpdateStatus`, `interface UpdateState { status; currentVersion: string; version: string | null; percent: number | null; message: string | null; lastCheckedAt: string | null; autoCheck: boolean; dismissed: boolean }`, `interface UpdateSettings { autoCheck: boolean; dismissedVersion: string | null; notifiedVersion: string | null }`, `FIRST_CHECK_DELAY_MS = 10_000`, `CHECK_INTERVAL_MS = 21_600_000`.
- Produces (`settings-store.ts`): `readUpdateSettings(db): UpdateSettings`, `saveUpdateSettings(db, patch: Partial<UpdateSettings>): void`.
- Produces (`update-service.ts`): `interface UpdaterLike`, `interface UpdateServiceDeps`, `class UpdateService` with `start()`, `stop()`, `state(): UpdateState`, `checkNow(): Promise<UpdateState>`, `download(): Promise<UpdateState>`, `install(): void`, `dismiss(): UpdateState`, `setAutoCheck(on: boolean): UpdateState`.

- [ ] **Step 1: Write the shared types**

Create `src/shared/updates.ts`:

```ts
export const UPDATE_STATUSES = [
  'disabled',
  'idle',
  'checking',
  'available',
  'downloading',
  'ready',
  'error',
] as const

export type UpdateStatus = (typeof UPDATE_STATUSES)[number]

export const FIRST_CHECK_DELAY_MS = 10_000
export const CHECK_INTERVAL_MS = 6 * 60 * 60_000

export interface UpdateState {
  readonly status: UpdateStatus
  readonly currentVersion: string
  readonly version: string | null
  readonly percent: number | null
  readonly message: string | null
  readonly lastCheckedAt: string | null
  readonly autoCheck: boolean
  readonly dismissed: boolean
}

export interface UpdateSettings {
  readonly autoCheck: boolean
  readonly dismissedVersion: string | null
  readonly notifiedVersion: string | null
}
```

- [ ] **Step 2: Write the failing service test**

Create `src/main/update-service.test.ts`:

```ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/main/update-service.test.ts`
Expected: FAIL, "Failed to resolve import ./update-service".

- [ ] **Step 4: Write the service**

Create `src/main/update-service.ts`:

```ts
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
  on(event: 'update-available' | 'update-downloaded', listener: (info: UpdateInfoLike) => void): unknown
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
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
    if (!updater || this.#status !== 'available') return this.state()
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
    if (this.#status === 'ready') this.#deps.updater?.quitAndInstall()
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

  async #automatic(): Promise<void> {
    if (this.#deps.settings.read().autoCheck) await this.#check()
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
    this.#deps.onChange(this.state())
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/main/update-service.test.ts`
Expected: PASS. If the `FakeUpdater` does not satisfy `UpdaterLike` (the overloaded `on`), loosen only the test's cast (`updater as unknown as UpdaterLike` where it is passed in); do not loosen `UpdaterLike`.

- [ ] **Step 6: Saved settings, with tests**

Read the top of `src/main/store/settings-store.test.ts` to match how it builds its database, import `readUpdateSettings` and `saveUpdateSettings`, and add (failing first):

```ts
describe('update settings', () => {
  it('defaults to automatic checking with nothing dismissed or notified', () => {
    expect(readUpdateSettings(db)).toEqual({
      autoCheck: true,
      dismissedVersion: null,
      notifiedVersion: null,
    })
  })

  it('saves each setting on its own and reads them back', () => {
    saveUpdateSettings(db, { autoCheck: false })
    saveUpdateSettings(db, { dismissedVersion: '1.1.0' })
    saveUpdateSettings(db, { notifiedVersion: '1.2.0' })

    expect(readUpdateSettings(db)).toEqual({
      autoCheck: false,
      dismissedVersion: '1.1.0',
      notifiedVersion: '1.2.0',
    })
  })

  it('clears a version saved as null', () => {
    saveUpdateSettings(db, { dismissedVersion: '1.1.0' })
    saveUpdateSettings(db, { dismissedVersion: null })

    expect(readUpdateSettings(db).dismissedVersion).toBeNull()
  })

  it.each([
    ['autoCheck', 'updates.autoCheck', '"yes"'],
    ['autoCheck', 'updates.autoCheck', 'not json'],
    ['dismissedVersion', 'updates.dismissedVersion', '5'],
  ])('falls back to the default for a bad stored %s', (_name, key, value) => {
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run(key, value)

    expect(readUpdateSettings(db)).toEqual({
      autoCheck: true,
      dismissedVersion: null,
      notifiedVersion: null,
    })
  })
})
```

Run `npx vitest run src/main/store/settings-store.test.ts` and see these FAIL. Then add to `src/main/store/settings-store.ts` (with `import type { UpdateSettings } from '@shared/updates'` and the key constants beside the others):

```ts
const UPDATES_AUTO_CHECK = 'updates.autoCheck'
const UPDATES_DISMISSED = 'updates.dismissedVersion'
const UPDATES_NOTIFIED = 'updates.notifiedVersion'

function readParsed<T>(db: DatabaseSync, key: string, schema: z.ZodType<T>, fallback: T): T {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(key) as
    { value: string } | undefined
  if (!row) return fallback
  try {
    const parsed = schema.safeParse(JSON.parse(row.value))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

function writeSetting(db: DatabaseSync, key: string, value: unknown): void {
  if (value === null) {
    db.prepare('DELETE FROM setting WHERE key = ?').run(key)
    return
  }
  db.prepare(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(key, JSON.stringify(value))
}

export function readUpdateSettings(db: DatabaseSync): UpdateSettings {
  return {
    autoCheck: readParsed(db, UPDATES_AUTO_CHECK, z.boolean(), true),
    dismissedVersion: readParsed(db, UPDATES_DISMISSED, z.string().nullable(), null),
    notifiedVersion: readParsed(db, UPDATES_NOTIFIED, z.string().nullable(), null),
  }
}

export function saveUpdateSettings(db: DatabaseSync, patch: Partial<UpdateSettings>): void {
  if (patch.autoCheck !== undefined) writeSetting(db, UPDATES_AUTO_CHECK, patch.autoCheck)
  if (patch.dismissedVersion !== undefined) writeSetting(db, UPDATES_DISMISSED, patch.dismissedVersion)
  if (patch.notifiedVersion !== undefined) writeSetting(db, UPDATES_NOTIFIED, patch.notifiedVersion)
}
```

Run the settings-store tests again; expected PASS.

- [ ] **Step 7: Check and commit**

Run: `npx prettier --write src/shared/updates.ts src/main/update-service.ts src/main/update-service.test.ts src/main/store && npm run lint && npm run typecheck && npx vitest run src/main`
Expected: all pass.

```bash
git add src
git commit -m "Add the update state machine and its saved settings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: IPC, tray entry and main-process wiring

**Files:**
- Modify: `src/shared/ipc.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/main/tray-menu.ts`, `src/main/tray-menu.test.ts`, `src/main/index.ts`, `src/renderer/src/test/fake-api.ts`, `src/main/ipc.test.ts`

**Interfaces:**
- Consumes: `UpdateService`, `UpdaterLike` (Task 2); `readUpdateSettings`, `saveUpdateSettings`; `UpdateState` from `@shared/updates`; `autoUpdater` from `electron-updater` (Task 1).
- Produces: `window.api.getUpdateState(): Promise<UpdateState>`, `checkForUpdates(): Promise<UpdateState>`, `downloadUpdate(): Promise<UpdateState>`, `installUpdate(): Promise<void>`, `dismissUpdate(): Promise<UpdateState>`, `setAutoCheck(on: boolean): Promise<UpdateState>`, `onUpdateStateChanged(listener: (state: UpdateState) => void): () => void`; channels `updates:get-state`, `updates:check`, `updates:download`, `updates:install`, `updates:dismiss`, `updates:set-auto-check`, push `updates:state-changed`; `TrayActions.updateLabel: () => string | null`.

- [ ] **Step 1: Add the shared contract**

In `src/shared/ipc.ts`: add `import type { UpdateState } from './updates'`; add to the `IPC` table after the `openLogsFolder` entry... (place with the other late additions):

```ts
  getUpdateState: 'updates:get-state',
  checkForUpdates: 'updates:check',
  downloadUpdate: 'updates:download',
  installUpdate: 'updates:install',
  dismissUpdate: 'updates:dismiss',
  setAutoCheck: 'updates:set-auto-check',
  updateStateChanged: 'updates:state-changed',
```

and to the `Api` interface (with the other late additions):

```ts
  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  installUpdate(): Promise<void>
  dismissUpdate(): Promise<UpdateState>
  setAutoCheck(on: boolean): Promise<UpdateState>
  onUpdateStateChanged(listener: (state: UpdateState) => void): () => void
```

- [ ] **Step 2: Write the failing IPC and tray tests**

In `src/main/ipc.test.ts`: add a fixture `const UPDATE_STATE: UpdateState = { status: 'idle', currentVersion: '1.0.0', version: null, percent: null, message: null, lastCheckedAt: null, autoCheck: true, dismissed: false }` (import the type from `@shared/updates`); add fakes after the logs fakes:

```ts
  getUpdateState: vi.fn(() => UPDATE_STATE),
  checkForUpdates: vi.fn(() => Promise.resolve(UPDATE_STATE)),
  downloadUpdate: vi.fn(() => Promise.resolve(UPDATE_STATE)),
  installUpdate: vi.fn(),
  dismissUpdate: vi.fn(() => UPDATE_STATE),
  setAutoCheck: vi.fn((on: boolean): UpdateState => ({ ...UPDATE_STATE, autoCheck: on })),
```

add `IPC.getUpdateState, IPC.checkForUpdates, IPC.downloadUpdate, IPC.installUpdate, IPC.dismissUpdate, IPC.setAutoCheck,` to the untrusted-sender `it.each` list, and add before `describe('library and dashboard handlers'`:

```ts
describe('update handlers', () => {
  it('returns the state and runs a check, a download, a dismiss and an install', async () => {
    expect(call(IPC.getUpdateState, TRUSTED)).toEqual(UPDATE_STATE)
    await expect(call(IPC.checkForUpdates, TRUSTED)).resolves.toEqual(UPDATE_STATE)
    await expect(call(IPC.downloadUpdate, TRUSTED)).resolves.toEqual(UPDATE_STATE)
    expect(call(IPC.dismissUpdate, TRUSTED)).toEqual(UPDATE_STATE)
    call(IPC.installUpdate, TRUSTED)

    expect(fakes.checkForUpdates).toHaveBeenCalledOnce()
    expect(fakes.downloadUpdate).toHaveBeenCalledOnce()
    expect(fakes.installUpdate).toHaveBeenCalledOnce()
  })

  it('takes no arguments from the page for those calls', () => {
    call(IPC.dismissUpdate, TRUSTED, '1.9.9')
    call(IPC.installUpdate, TRUSTED, 'C:\\evil.exe')

    expect(fakes.dismissUpdate).toHaveBeenCalledExactlyOnceWith()
    expect(fakes.installUpdate).toHaveBeenCalledExactlyOnceWith()
  })

  it('switches automatic checking on and off', () => {
    expect(call(IPC.setAutoCheck, TRUSTED, false)).toMatchObject({ autoCheck: false })
    expect(fakes.setAutoCheck).toHaveBeenCalledExactlyOnceWith(false)
  })

  it.each([['nothing', undefined], ['a string', 'no'], ['a number', 0]])(
    'ignores a switch change with %s',
    (_label, payload) => {
      expect(call(IPC.setAutoCheck, TRUSTED, payload)).toEqual(UPDATE_STATE)
      expect(fakes.setAutoCheck).not.toHaveBeenCalled()
    },
  )
})
```

In `src/main/tray-menu.test.ts`: add `updateLabel: () => null,` to the `actions()` defaults and add these tests in the `trayMenuTemplate` describe:

```ts
  it('adds an update entry under Open when an update is known, and opens the window from it', () => {
    const tray = actions({ updateLabel: () => 'Update available: v1.1.0' })

    const template = trayMenuTemplate(tray)
    const labels = template.filter((entry) => entry.type !== 'separator').map((e) => e.label)
    click(item(template, /Update available/))

    expect(labels.slice(0, 2)).toEqual(['Open Trophy Locker', 'Update available: v1.1.0'])
    expect(tray.open).toHaveBeenCalledOnce()
  })

  it('has no update entry when there is nothing to report', () => {
    const labels = trayMenuTemplate(actions()).map((entry) => entry.label ?? '')

    expect(labels.some((label) => /update/i.test(label))).toBe(false)
  })
```

Run `npx vitest run src/main/ipc.test.ts src/main/tray-menu.test.ts`. Expected: FAIL.

- [ ] **Step 3: Register the handlers and the tray entry**

In `src/main/ipc.ts`: import `UpdateState` from `@shared/updates`; add to `IpcHandlers`:

```ts
  getUpdateState(): UpdateState
  checkForUpdates(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  installUpdate(): void
  dismissUpdate(): UpdateState
  setAutoCheck(on: boolean): UpdateState
```

and register (reuse the existing boolean zod schema from the logging work, `flagSchema`):

```ts
  ipcMain.handle(IPC.getUpdateState, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getUpdateState()
  })

  ipcMain.handle(IPC.checkForUpdates, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.checkForUpdates()
  })

  ipcMain.handle(IPC.downloadUpdate, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.downloadUpdate()
  })

  ipcMain.handle(IPC.installUpdate, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    handlers.installUpdate()
  })

  ipcMain.handle(IPC.dismissUpdate, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.dismissUpdate()
  })

  ipcMain.handle(IPC.setAutoCheck, (event, on: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = flagSchema.safeParse(on)
    return parsed.success ? handlers.setAutoCheck(parsed.data) : handlers.getUpdateState()
  })
```

In `src/main/tray-menu.ts` add to `TrayActions`: `readonly updateLabel: () => string | null`, and in `trayMenuTemplate` build the first items as:

```ts
  const update = actions.updateLabel()
  return [
    { label: 'Open Trophy Locker', click: () => actions.open() },
    ...(update === null ? [] : [{ label: update, click: () => actions.open() }]),
    { label: 'Sync now', click: () => actions.syncNow() },
```

(keeping the rest of the array exactly as it is).

In `src/preload/index.ts` add:

```ts
  getUpdateState: () => ipcRenderer.invoke(IPC.getUpdateState),
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  downloadUpdate: () => ipcRenderer.invoke(IPC.downloadUpdate),
  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),
  dismissUpdate: () => ipcRenderer.invoke(IPC.dismissUpdate),
  setAutoCheck: (on) => ipcRenderer.invoke(IPC.setAutoCheck, on),
  onUpdateStateChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on(IPC.updateStateChanged, handler)
    return () => ipcRenderer.removeListener(IPC.updateStateChanged, handler)
  },
```

(import `UpdateState` from `@shared/updates` there). In `src/renderer/src/test/fake-api.ts` add defaults:

```ts
    getUpdateState: vi.fn().mockResolvedValue({
      status: 'disabled',
      currentVersion: '0.0.0',
      version: null,
      percent: null,
      message: null,
      lastCheckedAt: null,
      autoCheck: true,
      dismissed: false,
    }),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn().mockResolvedValue(undefined),
    dismissUpdate: vi.fn(),
    setAutoCheck: vi.fn(),
    onUpdateStateChanged: vi.fn(() => () => {}),
```

- [ ] **Step 4: Wire the main process**

In `src/main/index.ts`:
- Imports: `import { autoUpdater } from 'electron-updater'`, `import { Notification } from 'electron'` (add `Notification` to the existing `electron` import instead of a second import), `import { UpdateService, type UpdaterLike } from './update-service'`, and `readUpdateSettings`, `saveUpdateSettings` added to the existing `./store/settings-store` import.
- Before `registerIpcHandlers({`, after `startToggle` and the `tray` declaration, add:

```ts
  const updateService = new UpdateService({
    updater: app.isPackaged ? (autoUpdater as unknown as UpdaterLike) : null,
    currentVersion: app.getVersion(),
    settings: {
      read: () => readUpdateSettings(db),
      save: (patch) => saveUpdateSettings(db, patch),
    },
    windowVisible: () =>
      mainWindow !== null &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized(),
    notify: (version) => {
      if (!Notification.isSupported()) return
      const notification = new Notification({
        title: 'Trophy Locker update',
        body: `Version ${version} is available.`,
      })
      notification.on('click', showMainWindow)
      notification.show()
    },
    onChange: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.updateStateChanged, state)
      }
      tray?.refresh()
    },
  })
```

  (If `UpdaterLike` and the real `autoUpdater` are assignable without the cast, drop `as unknown as UpdaterLike`; the real type's overloads may need the cast.)
- In the handlers object, after the startup handlers:

```ts
    getUpdateState: () => updateService.state(),
    checkForUpdates: () => updateService.checkNow(),
    downloadUpdate: () => updateService.download(),
    installUpdate: () => updateService.install(),
    dismissUpdate: () => updateService.dismiss(),
    setAutoCheck: (on) => updateService.setAutoCheck(on),
```

- In the `createTray({...})` call add:

```ts
    updateLabel: () => {
      const state = updateService.state()
      if (state.version === null) return null
      if (state.status === 'ready') return `Restart to update to v${state.version}`
      if (state.status === 'available' && !state.dismissed) {
        return `Update available: v${state.version}`
      }
      return null
    },
```

- After `tray = createTray(...)`, add `updateService.start()`; in the existing `before-quit` handler add `updateService.stop()`.

- [ ] **Step 5: Run everything touched and commit**

Run: `npx prettier --write src && npm run lint && npm run typecheck && npx vitest run src/main`
Expected: all pass.

```bash
git add src
git commit -m "Add the update IPC calls, the tray entry and wire the update service in

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The update banner and the Updates card

**Files:**
- Create: `src/renderer/src/features/updates/useUpdateState.ts`, `UpdateBanner.tsx`
- Test: `src/renderer/src/features/updates/UpdateBanner.test.tsx`
- Create: `src/renderer/src/features/settings/UpdatesCard.tsx`, `UpdatesCard.test.tsx`
- Modify: `src/renderer/src/app/App.tsx`, `src/renderer/src/features/settings/Settings.tsx`, `Settings.test.tsx`

**Interfaces:**
- Consumes: the seven `window.api` update members (Task 3); `Button` from `@/components/Button`; `UpdateState` from `@shared/updates`.
- Produces: `useUpdateState(): { state: UpdateState | null; apply: (state: UpdateState) => void }`, `UpdateBanner`, `UpdatesCard` (no props).

- [ ] **Step 1: Write the hook**

Create `src/renderer/src/features/updates/useUpdateState.ts`:

```ts
import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/updates'

export function useUpdateState(): { state: UpdateState | null; apply: (state: UpdateState) => void } {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.getUpdateState().then(
      (current) => {
        if (!cancelled) setState((existing) => existing ?? current)
      },
      () => undefined,
    )
    const unsubscribe = window.api.onUpdateStateChanged(setState)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { state, apply: setState }
}
```

- [ ] **Step 2: Write the failing banner test**

Create `src/renderer/src/features/updates/UpdateBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/updates'
import { fakeApi } from '@/test/fake-api'
import { UpdateBanner } from './UpdateBanner'

const BASE: UpdateState = {
  status: 'idle',
  currentVersion: '1.0.0',
  version: null,
  percent: null,
  message: null,
  lastCheckedAt: null,
  autoCheck: true,
  dismissed: false,
}

const getUpdateState = vi.fn<() => Promise<UpdateState>>()
const downloadUpdate = vi.fn<() => Promise<UpdateState>>()
const dismissUpdate = vi.fn<() => Promise<UpdateState>>()
const installUpdate = vi.fn<() => Promise<void>>()
let push: (state: UpdateState) => void = () => undefined

beforeEach(() => {
  installUpdate.mockResolvedValue(undefined)
  window.api = fakeApi({
    getUpdateState,
    downloadUpdate,
    dismissUpdate,
    installUpdate,
    onUpdateStateChanged: (listener) => {
      push = listener
      return () => undefined
    },
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

async function showing(state: UpdateState) {
  getUpdateState.mockResolvedValue(state)
  render(<UpdateBanner />)
  await vi.waitFor(() => expect(getUpdateState).toHaveBeenCalled())
}

describe('UpdateBanner', () => {
  it.each([
    ['disabled', { ...BASE, status: 'disabled' as const }],
    ['idle', BASE],
    ['checking', { ...BASE, status: 'checking' as const }],
    ['an error', { ...BASE, status: 'error' as const, message: 'Could not check for updates.' }],
    ['a dismissed update', { ...BASE, status: 'available' as const, version: '1.1.0', dismissed: true }],
  ])('shows nothing for %s', async (_label, state) => {
    await showing(state)

    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('announces an available update with Download and Later', async () => {
    await showing({ ...BASE, status: 'available', version: '1.1.0' })

    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent('Version 1.1.0 is available.')
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument()
  })

  it('starts the download when Download is clicked, and shows what comes back', async () => {
    await showing({ ...BASE, status: 'available', version: '1.1.0' })
    downloadUpdate.mockResolvedValue({ ...BASE, status: 'downloading', version: '1.1.0', percent: 0 })

    fireEvent.click(await screen.findByRole('button', { name: 'Download' }))

    expect(downloadUpdate).toHaveBeenCalledOnce()
    expect(await screen.findByRole('progressbar')).toBeInTheDocument()
  })

  it('hides the banner when Later is clicked', async () => {
    await showing({ ...BASE, status: 'available', version: '1.1.0' })
    dismissUpdate.mockResolvedValue({
      ...BASE,
      status: 'available',
      version: '1.1.0',
      dismissed: true,
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Later' }))

    expect(dismissUpdate).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('shows download progress as it is pushed', async () => {
    await showing({ ...BASE, status: 'downloading', version: '1.1.0', percent: 10 })

    expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '10')
    act(() => push({ ...BASE, status: 'downloading', version: '1.1.0', percent: 60 }))

    await vi.waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('value', '60'))
  })

  it('offers Restart and update once the download is ready', async () => {
    await showing({ ...BASE, status: 'ready', version: '1.1.0', percent: 100 })

    expect(await screen.findByRole('status')).toHaveTextContent('Version 1.1.0 is ready to install.')
    fireEvent.click(screen.getByRole('button', { name: 'Restart and update' }))

    expect(installUpdate).toHaveBeenCalledOnce()
  })

  it('appears when a push says an update was found', async () => {
    await showing(BASE)

    act(() => push({ ...BASE, status: 'available', version: '1.2.0' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Version 1.2.0 is available.')
  })
})
```

Run `npx vitest run src/renderer/src/features/updates/UpdateBanner.test.tsx`. Expected: FAIL, "Failed to resolve import ./UpdateBanner".

- [ ] **Step 3: Write the banner**

Create `src/renderer/src/features/updates/UpdateBanner.tsx`:

```tsx
import { Button } from '@/components/Button'
import { useUpdateState } from './useUpdateState'

export function UpdateBanner() {
  const { state, apply } = useUpdateState()
  if (state === null) return null

  const { status, version, percent, dismissed } = state

  async function download() {
    apply(await window.api.downloadUpdate())
  }

  async function dismiss() {
    apply(await window.api.dismissUpdate())
  }

  const shell =
    'mx-auto mt-4 flex w-[calc(100%-48px)] max-w-348 flex-wrap items-center gap-3 rounded-panel border border-line bg-surface-1 px-5 py-3 text-sm'

  if (status === 'available' && !dismissed) {
    return (
      <div role="status" className={shell}>
        <span className="flex-1 text-fg">Version {version} is available.</span>
        <Button onClick={() => void download()}>Download</Button>
        <Button variant="secondary" onClick={() => void dismiss()}>
          Later
        </Button>
      </div>
    )
  }

  if (status === 'downloading') {
    return (
      <div role="status" className={shell}>
        <span className="flex-1 text-fg">Downloading version {version}…</span>
        <progress max={100} value={percent ?? 0} className="w-48 accent-primary" />
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div role="status" className={shell}>
        <span className="flex-1 text-fg">Version {version} is ready to install.</span>
        <Button onClick={() => void window.api.installUpdate()}>Restart and update</Button>
      </div>
    )
  }

  return null
}
```

- [ ] **Step 4: Run it, then write the UpdatesCard test**

Run: `npx vitest run src/renderer/src/features/updates/UpdateBanner.test.tsx`
Expected: PASS. (`getByRole('progressbar')` works on a native `<progress>`; if the `value` attribute assertion fails because jsdom reflects it differently, assert `toHaveValue(10)` instead.)

Create `src/renderer/src/features/settings/UpdatesCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/updates'
import { fakeApi } from '@/test/fake-api'
import { UpdatesCard } from './UpdatesCard'

const BASE: UpdateState = {
  status: 'idle',
  currentVersion: '1.0.0',
  version: null,
  percent: null,
  message: null,
  lastCheckedAt: null,
  autoCheck: true,
  dismissed: false,
}

const getUpdateState = vi.fn<() => Promise<UpdateState>>()
const checkForUpdates = vi.fn<() => Promise<UpdateState>>()
const downloadUpdate = vi.fn<() => Promise<UpdateState>>()
const installUpdate = vi.fn<() => Promise<void>>()
const setAutoCheck = vi.fn<(on: boolean) => Promise<UpdateState>>()

beforeEach(() => {
  installUpdate.mockResolvedValue(undefined)
  window.api = fakeApi({
    getUpdateState,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    setAutoCheck,
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

async function showing(state: UpdateState) {
  getUpdateState.mockResolvedValue(state)
  render(<UpdatesCard />)
  await screen.findByText('Trophy Locker 1.0.0')
}

describe('UpdatesCard', () => {
  it('has a titled region and shows the current version', async () => {
    await showing(BASE)

    expect(screen.getByRole('region', { name: 'Updates' })).toBeInTheDocument()
  })

  it('says why checking is off when the app is not installed', async () => {
    await showing({ ...BASE, status: 'disabled' })

    expect(screen.getByText('Updates are available in the installed app.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check now' })).toBeDisabled()
  })

  it('checks on request and shows the answer', async () => {
    await showing(BASE)
    checkForUpdates.mockResolvedValue({ ...BASE, status: 'available', version: '1.1.0' })

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(await screen.findByText('Version 1.1.0 is available.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('says it is up to date after a check that found nothing', async () => {
    await showing({ ...BASE, lastCheckedAt: '2026-10-02T12:00:00.000Z' })

    expect(screen.getByText(/You are up to date/)).toBeInTheDocument()
  })

  it('downloads, then offers Restart and update', async () => {
    await showing({ ...BASE, status: 'available', version: '1.1.0' })
    downloadUpdate.mockResolvedValue({ ...BASE, status: 'ready', version: '1.1.0', percent: 100 })

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restart and update' }))

    expect(downloadUpdate).toHaveBeenCalledOnce()
    expect(installUpdate).toHaveBeenCalledOnce()
  })

  it('shows an error from the last check', async () => {
    await showing({ ...BASE, status: 'error', message: 'Could not check for updates.' })

    expect(screen.getByRole('alert')).toHaveTextContent('Could not check for updates.')
  })

  it('has the automatic-check switch, says what it contacts, and saves a change', async () => {
    await showing(BASE)
    setAutoCheck.mockResolvedValue({ ...BASE, autoCheck: false })

    const toggle = screen.getByRole('checkbox', { name: 'Automatically check for updates' })
    expect(toggle).toBeChecked()
    expect(screen.getByText(/contacts github\.com/i)).toBeInTheDocument()
    fireEvent.click(toggle)

    await vi.waitFor(() => expect(setAutoCheck).toHaveBeenCalledExactlyOnceWith(false))
    await vi.waitFor(() => expect(toggle).not.toBeChecked())
  })

  it('shows an alert when a button press fails', async () => {
    await showing(BASE)
    checkForUpdates.mockRejectedValue(new Error('boom'))

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })
})
```

Run: `npx vitest run src/renderer/src/features/settings/UpdatesCard.test.tsx`. Expected: FAIL, "Failed to resolve import ./UpdatesCard".

- [ ] **Step 5: Write the card**

Create `src/renderer/src/features/settings/UpdatesCard.tsx`:

```tsx
import { useId, useState } from 'react'
import { Button } from '@/components/Button'
import { useUpdateState } from '@/features/updates/useUpdateState'
import type { UpdateState } from '@shared/updates'

function statusText(state: UpdateState): string {
  switch (state.status) {
    case 'disabled':
      return 'Updates are available in the installed app.'
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Version ${state.version} is available.`
    case 'downloading':
      return `Downloading version ${state.version}…`
    case 'ready':
      return `Version ${state.version} is ready to install.`
    case 'error':
      return ''
    case 'idle':
      return state.lastCheckedAt === null
        ? 'No update check has run yet.'
        : 'You are up to date.'
  }
}

export function UpdatesCard() {
  const { state, apply } = useUpdateState()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const id = useId()

  async function run(action: () => Promise<UpdateState | void>) {
    setBusy(true)
    setFailed(false)
    try {
      const next = await action()
      if (next) apply(next)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Updates
        </h2>
        {state && <p className="text-sm text-fg-muted">Trophy Locker {state.currentVersion}</p>}
      </div>

      {state && (
        <>
          <p className="text-sm">{statusText(state)}</p>
          {state.status === 'error' && state.message && (
            <p role="alert" className="text-sm text-danger">
              {state.message}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={
                busy ||
                state.status === 'disabled' ||
                state.status === 'checking' ||
                state.status === 'downloading'
              }
              onClick={() => void run(() => window.api.checkForUpdates())}
            >
              Check now
            </Button>
            {state.status === 'available' && (
              <Button disabled={busy} onClick={() => void run(() => window.api.downloadUpdate())}>
                Download
              </Button>
            )}
            {state.status === 'ready' && (
              <Button disabled={busy} onClick={() => void run(() => window.api.installUpdate())}>
                Restart and update
              </Button>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary"
              checked={state.autoCheck}
              disabled={busy}
              onChange={(event) => void run(() => window.api.setAutoCheck(event.target.checked))}
            />
            <span>
              Automatically check for updates
              <span className="block">
                Checking contacts github.com to read the list of releases and sends nothing else
                about you or your library. Turn it off to stop all update traffic; you can still
                check by hand.
              </span>
            </span>
          </label>
        </>
      )}

      {failed && (
        <p role="alert" className="text-sm text-danger">
          Something went wrong. Try again.
        </p>
      )}
    </section>
  )
}
```

The checkbox's accessible name must be exactly "Automatically check for updates": if the nested description makes the name longer, move the description out of the `<label>` into a sibling `<p>` and tie it with `aria-describedby`.

- [ ] **Step 6: Run it, then add the card and the banner to the app**

Run: `npx vitest run src/renderer/src/features/settings/UpdatesCard.test.tsx`
Expected: PASS. If `getByText('Trophy Locker 1.0.0')` fails because the version is in a separate text node, keep the markup as written (one string) and fix the test's matcher, not the copy.

In `src/renderer/src/features/settings/Settings.tsx` add `import { UpdatesCard } from './UpdatesCard'` and put `<UpdatesCard />` after `<LogsCard />` in the `max-w-3xl` column. In `Settings.test.tsx` add:

```tsx
  it('shows the Updates card', async () => {
    renderSettings()

    expect(await screen.findByRole('region', { name: 'Updates' })).toBeInTheDocument()
  })
```

In `src/renderer/src/app/App.tsx` add `import { UpdateBanner } from '@/features/updates/UpdateBanner'` and render `<UpdateBanner />` directly after `<IslandNav ... />` and before `<main ...>` in the final return. In `src/renderer/src/app/App.test.tsx` add one test, following the file's existing render and fake-api pattern, that the banner shows `Version 1.1.0 is available.` when `getUpdateState` resolves an `available` state, and that it is absent for the default (disabled) state.

- [ ] **Step 7: Run all checks and commit**

Run: `npx prettier --write src/renderer/src && npm run format:check && npm run lint && npm run typecheck && npm test`
Expected: all pass.

```bash
git add src/renderer
git commit -m "Add the update banner and the Updates card

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The release workflow, the ADR and the README

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `docs/adr/0016-release-and-updates.md`
- Modify: `README.md`, `docs/ARCHITECTURE.md` (the Packaging row)

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - name: The tag matches the package version
        shell: bash
        run: |
          version=$(node -p "require('./package.json').version")
          if [ "$GITHUB_REF_NAME" != "v$version" ]; then
            echo "Tag $GITHUB_REF_NAME does not match package.json version v$version"
            exit 1
          fi
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - name: Package and publish a draft release
        run: npx electron-builder --win --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Write ADR-0016**

Follow the structure of `docs/adr/0015-emulators-in-v1.md` (Status, Date, Context, Options considered table, Decision, Consequences). Date 2026-10-02, status Accepted. Content: Windows only for v1; unsigned installer (cost and time of a certificate against a first release; SmartScreen warning accepted and documented); GitHub Releases as the only distribution and update source; `electron-updater` in notify-only mode (no download until the user asks; verified against `latest.yml` SHA-512); per-user NSIS install (no admin); **privacy**: update checking is the first request the app makes to anything other than the user's connected platforms, it reads the public release feed on github.com and sends nothing else, it can be switched off, and the switch is on by default because security fixes matter more than the single request; options considered include "no auto-update, manual download only", "Microsoft Store (MSIX)", "sign with Azure Trusted Signing", and "download updates automatically". Consequences: users see a SmartScreen warning at first install until reputation builds; signing can be added later without changing the update mechanism (electron-updater verifies the publisher once a certificate exists); a release is a pushed tag plus pressing Publish on the draft.

- [ ] **Step 3: Update README and ARCHITECTURE**

In `README.md` add a **Download** section near the top: where the installer is (the repository's Releases page), that it installs for the current user without admin rights, and that because v1 is unsigned Windows SmartScreen may say "Windows protected your PC": click **More info**, then **Run anyway**. Add a short **Updates** note: the app checks GitHub for new versions at launch and every few hours, tells you, and only downloads when you press Download; it can be switched off in Settings. In `docs/ARCHITECTURE.md` change the Packaging row from `electron-builder (M6)` to `electron-builder, NSIS per-user installer, published to GitHub Releases; `electron-updater` notify-only (ADR-0016)`.

- [ ] **Step 4: Check and commit**

Run: `npm run format:check && npm run lint`
Expected: pass. Check the YAML is valid by reading it back; do not push a tag.

```bash
git add .github docs README.md
git commit -m "Add the release workflow, ADR-0016 and the download notes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Measurement, version 1.0.0, docs and the PR

**Files:**
- Create: `src/main/store/large-library.test.ts`, `scripts/measure-idle.ps1`, `docs/PERFORMANCE.md`
- Modify: `src/main/index.ts` (one `console.info` line), `package.json` (version), `docs/SPEC.md`, `docs/ROADMAP.md`, `docs/PROJECT-MAP.md`, `docs/superpowers/specs/2026-10-02-release-engineering-design.md`, `CLAUDE.md`

- [ ] **Step 1: A large-library timing test that is off by default**

Create `src/main/store/large-library.test.ts`: a `describe.skipIf(process.env.TL_LARGE !== '1')` block that builds an in-memory database with `applyMigrations`, inserts one account and 5,000 `platform_game` rows (each with a `game` row via the same insert path the app uses, `addPlatformGames`, in batches inside a transaction) and 200,000 `achievement` rows (40 per game) with about 30% `unlock` rows (via `upsertAchievements` and `insertNewUnlocks` or direct prepared inserts inside one transaction, whichever is fast enough to finish in under a minute), then times `listLibraryGames`, `getDashboardStats` and `listActivity` (using the real exports from `./library-store`) with `performance.now()`, logs each time with `console.info`, and asserts each is under 2,000 ms. Set a 120 s test timeout. Run it once with `TL_LARGE=1 npx vitest run src/main/store/large-library.test.ts` and record the three timings; confirm a plain `npm test` still skips it.

- [ ] **Step 2: A start-to-tray marker**

In `src/main/index.ts`, directly after `tray = createTray({...})` add `console.info('Ready in the tray')` (the console is captured into the log, giving a timestamp to measure cold start against).

- [ ] **Step 3: The idle measurement script**

Create `scripts/measure-idle.ps1` (PowerShell 5.1 compatible) taking `-ExePath` and `-Minutes` (default 5) and `-UserDataDir` (default a fresh temp folder). It must: start the exe with `--hidden --user-data-dir=<dir>`, record the process start time, wait until `<dir>\logs\trophy-locker.log` contains `Ready in the tray` (timeout 60 s) and print the seconds from process start to that log line's `time` field as the cold start; wait 30 s to settle; then for `-Minutes` minutes sample every 5 s the processes whose path is the exe (sum of `WorkingSet64` and of `PrivateMemorySize64`, and total CPU seconds); print the average and peak private memory in MB, the peak working set in MB, the number of processes, and the average CPU percent of one core over the window (CPU-seconds delta divided by wall-seconds, divided by the logical core count for the whole-machine figure); finally stop the processes. It prints a plain summary and never changes anything outside the temp folder.

- [ ] **Step 4: Version and a final build**

Set `"version": "1.0.0"` in `package.json` (and the matching two fields in `package-lock.json` via `npm install --package-lock-only`). Run `npm run dist:dir` and `npm run dist`; record the installer size.

- [ ] **Step 5: Measure**

Run the script against `release/win-unpacked/Trophy Locker.exe` (PowerShell, `ELECTRON_RUN_AS_NODE` cleared) with a fresh user data dir and 5 minutes, on this machine, with the app idle in the tray. Create `docs/PERFORMANCE.md` with: the date, the machine (CPU model, RAM, Windows version) and the build, then a table of N-01 to N-07: the target, the measured figure and a verdict. N-01 CPU and N-02 memory and N-06 cold start come from the script; N-05 from the installer size; N-07 from Step 1's three timings (and a sentence that list rendering is virtualized and covered by component tests); N-03 and N-04 cite the existing measurements in ROADMAP and `docs/PROVIDERS.md` and say they were not re-run. A figure outside its target is written as it is, with the decision (fix before release, or revise the target in SPEC with the reason). Do not adjust a target to make a failing figure pass without saying so.

- [ ] **Step 6: Docs**

- `docs/SPEC.md`: add the update IPC rows (`getUpdateState`, `checkForUpdates`, `downloadUpdate`, `installUpdate`, `dismissUpdate`, `setAutoCheck`, and the `updates:state-changed` push) in the table's style; update any N-target text to the measured results in PERFORMANCE.md; document the saved settings `updates.autoCheck`, `updates.dismissedVersion`, `updates.notifiedVersion`.
- `docs/superpowers/specs/2026-10-02-release-engineering-design.md`: add a short "Deviations" note that `disabled` means only "not packaged" (automatic checking off leaves the state `idle`).
- `docs/ROADMAP.md`: tick the M6 items that are done (installer, signed auto-update replaced by notify-only unsigned updates per ADR-0016, performance validation, v1.0.0 pending the owner's hands-on checks); leave "Code signing" ticked as deferred with a pointer to ADR-0016, and keep "Crash reporting, docs site/README screenshots" unticked.
- `docs/PROJECT-MAP.md`: rows for `shared/updates.ts`, `update-service.ts`, `store/large-library.test.ts`, `scripts/measure-idle.ps1`, `features/updates/*`, `settings/UpdatesCard.tsx`, `.github/workflows/release.yml`, `docs/PERFORMANCE.md`, the `package.json` build config, and the tray's update entry.
- `CLAUDE.md`: add `npm run dist` and `npm run dist:dir` to Commands; update the Status test count to the real `npm test` total and mention installer and updates.

- [ ] **Step 7: Final checks, commit, and hand over**

Run: `npm run format:check && npm run lint && npm run typecheck && npm test`
Expected: all pass.

```bash
git add -A
git commit -m "Measure v1.0.0, set the version and update the docs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Do not push or open the PR (the owner's hands-on checks come first). The hands-on list for the owner, to put in the final report:

1. Run `release/Trophy-Locker-Setup-1.0.0.exe`: installs without an admin prompt, shortcut works, uninstall from Windows Settings is clean.
2. Install over an older build: data under `%APPDATA%\trophy-locker` is kept.
3. Push a test tag (for example `v1.0.0-test.1` after temporarily setting the version to match, on a scratch branch or a fork) and confirm a draft release appears with the installer, `latest.yml` and the blockmap.
4. With two published releases, install the older one and check the banner appears, Download then Restart and update works, and a system notification appears when the app is in the tray.
5. Settings: Start with Windows works in the installed build, and the Updates card switch stops the checks.
