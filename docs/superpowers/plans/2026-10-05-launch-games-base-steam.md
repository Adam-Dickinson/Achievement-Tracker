# Launching installed games: base and Steam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Game detail gets Play buttons and the Library an Installed filter, backed by a launch module with a working Steam adapter (phases 1 and 2 of the spec).

**Architecture:** `src/main/launch/` holds pure helpers (title matching, start-up of a target), a `LaunchService` that scans adapters and keeps the installs in memory, and a Steam adapter. The service matches installs to library rows on demand, so no database change is needed. Three IPC calls and one push channel expose it. The renderer only ever sends a `platformGameId`.

**Tech Stack:** Electron main (Node), zod v4 for IPC payloads, React 19 function components, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-05-launch-games-design.md](../specs/2026-10-05-launch-games-design.md)

## Global Constraints

- CLAUDE.md applies in full: TypeScript strict with `noUncheckedIndexedAccess`, no `any`, no code comments, Prettier (no semicolons, single quotes), ESLint zero warnings, Tailwind tokens only (no hex).
- Rule 4: never read or touch a game process. Launching only goes through the platform's launcher URI or the emulator.
- Rule 9: new capability goes `src/shared/ipc.ts` → `src/main/ipc.ts` (validate sender with `isTrustedSender` and payload with zod) → `src/preload/index.ts`. The renderer never supplies a URI, path or arguments.
- Rule 8: no schema change in this plan (matching happens in memory).
- Never run Prettier on `.md` files. `npm run format` covers `src` and config only.
- Before each commit: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` all pass. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Spec deviations decided here (also recorded in Task 8): the Play control is one button per install ("Play" when there is one, "Play on <Platform>" when several) instead of a menu; `getInstalled()` entries carry `gameId` so the Library filter needs no extra lookup; installs are re-scanned at startup (10 s after the window exists), when the main window gains focus (at most once a minute) and after a failed Play, so no Rescan button is needed.

---

### Task 1: Shared types, IPC contract, preload, handlers

**Files:**
- Create: `src/shared/launch.ts`
- Modify: `src/shared/ipc.ts` (channels in `IPC`, methods in the `Api` interface)
- Modify: `src/main/ipc.ts` (`IpcHandlers` entries and three `ipcMain.handle` registrations)
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/test/fake-api.ts`
- Test: `src/main/ipc.test.ts`

**Interfaces:**
- Produces (used by later tasks):
  - `InstalledEntry { gameId: number; platformGameId: number; platform: Platform }`
  - `KnownGame { id: number; gameId: number; platform: Platform; externalId: string; title: string }` (a `platform_game` row, used for install matching)
  - `PlayResult = { ok: true } | { ok: false; reason: string }`
  - `window.api.getInstalled(): Promise<InstalledEntry[]>`, `playGame(platformGameId: number): Promise<PlayResult>`, `rescanInstalled(): Promise<InstalledEntry[]>`, `onInstalledChanged(listener: () => void): () => void`
  - `IpcHandlers.getInstalled(): InstalledEntry[]`, `playGame(platformGameId: number): Promise<PlayResult>`, `rescanInstalled(): Promise<InstalledEntry[]>`
  - `IPC.installedChanged` (push channel, no payload)

- [ ] **Step 1: Write the failing tests** — append to `src/main/ipc.test.ts` (add `getInstalled`, `playGame`, `rescanInstalled` to the `fakes` object first, shown below, then these tests inside `describe('registerIpcHandlers', …)`):

```ts
  getInstalled: vi.fn(() => [{ gameId: 3, platformGameId: 7, platform: 'steam' as const }]),
  playGame: vi.fn(() => Promise.resolve({ ok: true as const })),
  rescanInstalled: vi.fn(() => Promise.resolve([])),
```

```ts
  it('lists installed games for our own pages and refuses others', () => {
    expect(call(IPC.getInstalled, TRUSTED)).toEqual([
      { gameId: 3, platformGameId: 7, platform: 'steam' },
    ])
    expect(() => call(IPC.getInstalled, UNTRUSTED)).toThrow('Untrusted sender')
  })

  it('plays a game by its platform game id only', async () => {
    await expect(call(IPC.playGame, TRUSTED, 7)).resolves.toEqual({ ok: true })
    expect(fakes.playGame).toHaveBeenCalledWith(7)
    expect(() => call(IPC.playGame, UNTRUSTED, 7)).toThrow('Untrusted sender')
  })

  it('refuses to play with a bad payload', async () => {
    for (const bad of ['steam://rungameid/220', -1, 1.5, null, { uri: 'x' }]) {
      await expect(call(IPC.playGame, TRUSTED, bad)).resolves.toEqual({
        ok: false,
        reason: 'That request was not understood.',
      })
    }
    expect(fakes.playGame).not.toHaveBeenCalled()
  })

  it('rescans installed games for our own pages and refuses others', async () => {
    await expect(call(IPC.rescanInstalled, TRUSTED)).resolves.toEqual([])
    expect(() => call(IPC.rescanInstalled, UNTRUSTED)).toThrow('Untrusted sender')
  })
```

(If the test file names its trusted/untrusted events differently from `TRUSTED` / `UNTRUSTED`, use the names already in the file.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/ipc.test.ts`
Expected: FAIL (`IPC.getInstalled` undefined / type errors).

- [ ] **Step 3: Implement**

`src/shared/launch.ts`:

```ts
import type { Platform } from './platform'

export interface InstalledEntry {
  readonly gameId: number
  readonly platformGameId: number
  readonly platform: Platform
}

export type PlayResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export interface KnownGame {
  readonly id: number
  readonly gameId: number
  readonly platform: Platform
  readonly externalId: string
  readonly title: string
}
```

`src/shared/ipc.ts`: add `import type { InstalledEntry, PlayResult } from './launch'`; in `IPC` after `openStorePage`:

```ts
  getInstalled: 'launch:get-installed',
  playGame: 'launch:play',
  rescanInstalled: 'launch:rescan',
  installedChanged: 'launch:installed-changed',
```

and in the `Api` interface after `openStorePage(...)`:

```ts
  getInstalled(): Promise<InstalledEntry[]>
  playGame(platformGameId: number): Promise<PlayResult>
  rescanInstalled(): Promise<InstalledEntry[]>
  onInstalledChanged(listener: () => void): () => void
```

`src/main/ipc.ts`: add `import type { InstalledEntry, PlayResult } from '@shared/launch'`; in `IpcHandlers` after `openStorePage`:

```ts
  getInstalled(): InstalledEntry[]
  playGame(platformGameId: number): Promise<PlayResult>
  rescanInstalled(): Promise<InstalledEntry[]>
```

and after the `IPC.openStorePage` registration:

```ts
  ipcMain.handle(IPC.getInstalled, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getInstalled()
  })

  ipcMain.handle(IPC.playGame, (event, platformGameId: unknown): Promise<PlayResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = gameIdSchema.safeParse(platformGameId)
    if (!parsed.success) {
      return Promise.resolve({ ok: false, reason: 'That request was not understood.' })
    }
    return handlers.playGame(parsed.data)
  })

  ipcMain.handle(IPC.rescanInstalled, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.rescanInstalled()
  })
```

`src/preload/index.ts` after `openStorePage`:

```ts
  getInstalled: () => ipcRenderer.invoke(IPC.getInstalled),
  playGame: (platformGameId) => ipcRenderer.invoke(IPC.playGame, platformGameId),
  rescanInstalled: () => ipcRenderer.invoke(IPC.rescanInstalled),
```

and after `onDataChanged`:

```ts
  onInstalledChanged: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(IPC.installedChanged, handler)
    return () => ipcRenderer.removeListener(IPC.installedChanged, handler)
  },
```

`src/renderer/src/test/fake-api.ts` after `openStorePage`:

```ts
    getInstalled: vi.fn().mockResolvedValue([]),
    playGame: vi.fn().mockResolvedValue({ ok: true }),
    rescanInstalled: vi.fn().mockResolvedValue([]),
    onInstalledChanged: vi.fn(() => () => {}),
```

`src/main/index.ts` does not compile until Task 6 supplies the three handlers. To keep the tree compiling, add temporary stubs to the handlers object in `index.ts` right after `openStorePage` and replace them in Task 6:

```ts
    getInstalled: () => [],
    playGame: () => Promise.resolve({ ok: false, reason: 'Launching is not available yet.' }),
    rescanInstalled: () => Promise.resolve([]),
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/main/ipc.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/launch.ts src/shared/ipc.ts src/main/ipc.ts src/preload/index.ts src/renderer/src/test/fake-api.ts src/main/index.ts src/main/ipc.test.ts
git commit -m "Add the launch IPC contract and validated handlers"
```

---

### Task 2: Matching and starting a target (pure helpers)

**Files:**
- Create: `src/main/launch/types.ts`
- Create: `src/main/launch/match.ts`
- Create: `src/main/launch/start.ts`
- Create: `src/main/launch/spawn.ts`
- Test: `src/main/launch/match.test.ts`, `src/main/launch/start.test.ts`, `src/main/launch/spawn.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `LaunchTarget` (`{ kind: 'uri'; uri: string } | { kind: 'program'; exe: string; args: readonly string[] }`), `InstalledGame { platform: Platform; externalId: string; title: string; target: LaunchTarget }`, `InstallAdapter { platform: Platform; findInstalled(): Promise<readonly InstalledGame[]> }`
  - `match.ts`: `MatchedInstall { known: KnownGame; target: LaunchTarget }`, `normalizeTitle(title: string): string`, `matchInstalled(known: readonly KnownGame[], installed: readonly InstalledGame[]): MatchedInstall[]`
  - `start.ts`: `StartDeps { openExternal(uri: string): Promise<void>; spawnProgram(exe: string, args: readonly string[]): Promise<void>; fileExists(path: string): Promise<boolean> }`, `isLaunchUri(uri: string): boolean`, `startTarget(target: LaunchTarget, deps: StartDeps): Promise<PlayResult>`
  - `spawn.ts`: `spawnDetached(exe: string, args: readonly string[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`src/main/launch/match.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { KnownGame } from '@shared/launch'
import { matchInstalled, normalizeTitle } from './match'
import type { InstalledGame } from './types'

const known = (over: Partial<KnownGame>): KnownGame => ({
  id: 1,
  gameId: 10,
  platform: 'steam',
  externalId: '220',
  title: 'Half-Life 2',
  ...over,
})

const installed = (over: Partial<InstalledGame>): InstalledGame => ({
  platform: 'steam',
  externalId: '220',
  title: 'Half-Life 2',
  target: { kind: 'uri', uri: 'steam://rungameid/220' },
  ...over,
})

describe('normalizeTitle', () => {
  it.each([
    ['The Witcher® 3: Wild Hunt', 'the witcher 3 wild hunt'],
    ['DOOM Eternal™', 'doom eternal'],
    ['Cyberpunk 2077 - Ultimate Edition', 'cyberpunk 2077'],
    ['Pokémon  Legends', 'pokemon legends'],
    ['  ', ''],
  ])('turns %j into %j', (title, expected) => {
    expect(normalizeTitle(title)).toBe(expected)
  })
})

describe('matchInstalled', () => {
  it('matches on platform and external id', () => {
    const result = matchInstalled([known({})], [installed({ title: 'Something else' })])

    expect(result).toHaveLength(1)
    expect(result[0]?.known.id).toBe(1)
  })

  it('falls back to the normalised title on the same platform', () => {
    const result = matchInstalled(
      [known({ externalId: 'abc', title: 'Doom Eternal' })],
      [installed({ externalId: 'zzz', title: 'DOOM Eternal™' })],
    )

    expect(result).toHaveLength(1)
  })

  it('never matches across platforms', () => {
    const result = matchInstalled([known({ platform: 'xbox' })], [installed({})])

    expect(result).toEqual([])
  })

  it('does not match two different games with an empty normalised title', () => {
    const result = matchInstalled(
      [known({ externalId: 'a', title: '™' })],
      [installed({ externalId: 'b', title: '®' })],
    )

    expect(result).toEqual([])
  })

  it('prefers the id match over a title match', () => {
    const byId = installed({ externalId: '220', title: 'Different', target: { kind: 'uri', uri: 'steam://rungameid/220' } })
    const byTitle = installed({ externalId: '999', title: 'Half-Life 2', target: { kind: 'uri', uri: 'steam://rungameid/999' } })

    const result = matchInstalled([known({})], [byTitle, byId])

    expect(result[0]?.target).toEqual({ kind: 'uri', uri: 'steam://rungameid/220' })
  })

  it('matches each known game separately', () => {
    const result = matchInstalled(
      [known({}), known({ id: 2, gameId: 11, platform: 'epic', externalId: 'e1', title: 'Fortnite' })],
      [installed({}), installed({ platform: 'epic', externalId: 'e1', title: 'Fortnite' })],
    )

    expect(result.map((match) => match.known.id)).toEqual([1, 2])
  })
})
```

`src/main/launch/start.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { isLaunchUri, startTarget, type StartDeps } from './start'

function deps(over: Partial<StartDeps> = {}): StartDeps {
  return {
    openExternal: vi.fn().mockResolvedValue(undefined),
    spawnProgram: vi.fn().mockResolvedValue(undefined),
    fileExists: vi.fn().mockResolvedValue(true),
    ...over,
  }
}

describe('isLaunchUri', () => {
  it.each([
    'steam://rungameid/220',
    'uplay://launch/1081/0',
    'com.epicgames.launcher://apps/abc?action=launch&silent=true',
    'origin2://game/launch/?offerIds=123',
  ])('allows %s', (uri) => expect(isLaunchUri(uri)).toBe(true))

  it.each([
    'https://example.com',
    'file:///C:/Windows/System32/cmd.exe',
    'javascript:alert(1)',
    'cmd.exe /c calc',
    'steam://rungameid/220 --evil',
    '',
  ])('refuses %s', (uri) => expect(isLaunchUri(uri)).toBe(false))
})

describe('startTarget', () => {
  it('opens an allowed uri', async () => {
    const d = deps()

    await expect(startTarget({ kind: 'uri', uri: 'steam://rungameid/220' }, d)).resolves.toEqual({
      ok: true,
    })
    expect(d.openExternal).toHaveBeenCalledWith('steam://rungameid/220')
  })

  it('refuses a uri that is not allowed', async () => {
    const d = deps()

    const result = await startTarget({ kind: 'uri', uri: 'https://example.com' }, d)

    expect(result.ok).toBe(false)
    expect(d.openExternal).not.toHaveBeenCalled()
  })

  it('reports a launcher that could not be opened', async () => {
    const d = deps({ openExternal: vi.fn().mockRejectedValue(new Error('no handler')) })

    await expect(startTarget({ kind: 'uri', uri: 'steam://rungameid/220' }, d)).resolves.toEqual({
      ok: false,
      reason: 'Could not open the launcher.',
    })
  })

  it('starts a program with its arguments as an array', async () => {
    const d = deps()

    const result = await startTarget(
      { kind: 'program', exe: 'D:\\Emulators\\rpcs3.exe', args: ['D:\\Games\\game.iso'] },
      d,
    )

    expect(result).toEqual({ ok: true })
    expect(d.spawnProgram).toHaveBeenCalledWith('D:\\Emulators\\rpcs3.exe', ['D:\\Games\\game.iso'])
  })

  it('refuses a program that is not an exe', async () => {
    const d = deps()

    const result = await startTarget({ kind: 'program', exe: 'D:\\x\\script.bat', args: [] }, d)

    expect(result.ok).toBe(false)
    expect(d.spawnProgram).not.toHaveBeenCalled()
  })

  it('reports a program that no longer exists', async () => {
    const d = deps({ fileExists: vi.fn().mockResolvedValue(false) })

    await expect(
      startTarget({ kind: 'program', exe: 'D:\\gone\\rpcs3.exe', args: [] }, d),
    ).resolves.toEqual({ ok: false, reason: 'The program was not found.' })
    expect(d.spawnProgram).not.toHaveBeenCalled()
  })

  it('reports a program that failed to start', async () => {
    const d = deps({ spawnProgram: vi.fn().mockRejectedValue(new Error('EACCES')) })

    await expect(
      startTarget({ kind: 'program', exe: 'D:\\x\\rpcs3.exe', args: [] }, d),
    ).resolves.toEqual({ ok: false, reason: 'The program could not be started.' })
  })
})
```

`src/main/launch/spawn.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { spawnDetached } from './spawn'

describe('spawnDetached', () => {
  it('resolves once the program has started', async () => {
    await expect(spawnDetached(process.execPath, ['-e', ''])).resolves.toBeUndefined()
  })

  it('rejects when the program cannot be started', async () => {
    await expect(spawnDetached('Z:\\definitely\\missing.exe', [])).rejects.toBeInstanceOf(Error)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/launch`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/main/launch/types.ts`:

```ts
import type { Platform } from '@shared/platform'

export type LaunchTarget =
  | { readonly kind: 'uri'; readonly uri: string }
  | { readonly kind: 'program'; readonly exe: string; readonly args: readonly string[] }

export interface InstalledGame {
  readonly platform: Platform
  readonly externalId: string
  readonly title: string
  readonly target: LaunchTarget
}

export interface InstallAdapter {
  readonly platform: Platform
  findInstalled(): Promise<readonly InstalledGame[]>
}
```

`src/main/launch/match.ts`:

```ts
import type { KnownGame } from '@shared/launch'
import type { InstalledGame, LaunchTarget } from './types'

export interface MatchedInstall {
  readonly known: KnownGame
  readonly target: LaunchTarget
}

const EDITION_WORDS =
  /\b(game of the year|goty|definitive|complete|deluxe|ultimate|standard|remastered|edition)\b/g

export function normalizeTitle(title: string): string {
  return title
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(EDITION_WORDS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchInstalled(
  known: readonly KnownGame[],
  installed: readonly InstalledGame[],
): MatchedInstall[] {
  const matches: MatchedInstall[] = []
  for (const game of known) {
    const samePlatform = installed.filter((item) => item.platform === game.platform)
    const wanted = normalizeTitle(game.title)
    const found =
      samePlatform.find((item) => item.externalId === game.externalId) ??
      (wanted === ''
        ? undefined
        : samePlatform.find((item) => normalizeTitle(item.title) === wanted))
    if (found) matches.push({ known: game, target: found.target })
  }
  return matches
}
```

`src/main/launch/start.ts`:

```ts
import type { PlayResult } from '@shared/launch'
import type { LaunchTarget } from './types'

const LAUNCH_SCHEMES: readonly string[] = ['steam:', 'uplay:', 'com.epicgames.launcher:', 'origin2:']

export interface StartDeps {
  openExternal(uri: string): Promise<void>
  spawnProgram(exe: string, args: readonly string[]): Promise<void>
  fileExists(path: string): Promise<boolean>
}

export function isLaunchUri(uri: string): boolean {
  if (/\s/.test(uri)) return false
  try {
    return LAUNCH_SCHEMES.includes(new URL(uri).protocol)
  } catch {
    return false
  }
}

export async function startTarget(target: LaunchTarget, deps: StartDeps): Promise<PlayResult> {
  if (target.kind === 'uri') return startUri(target.uri, deps)
  return startProgram(target.exe, target.args, deps)
}

async function startUri(uri: string, deps: StartDeps): Promise<PlayResult> {
  if (!isLaunchUri(uri)) return { ok: false, reason: 'That game cannot be started from here.' }
  try {
    await deps.openExternal(uri)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'Could not open the launcher.' }
  }
}

async function startProgram(
  exe: string,
  args: readonly string[],
  deps: StartDeps,
): Promise<PlayResult> {
  if (!exe.toLowerCase().endsWith('.exe')) {
    return { ok: false, reason: 'That game cannot be started from here.' }
  }
  if (!(await deps.fileExists(exe))) return { ok: false, reason: 'The program was not found.' }
  try {
    await deps.spawnProgram(exe, args)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'The program could not be started.' }
  }
}
```

`src/main/launch/spawn.ts`:

```ts
import { spawn } from 'node:child_process'

export function spawnDetached(exe: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, [...args], { detached: true, stdio: 'ignore', shell: false })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/main/launch && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/launch
git commit -m "Add launch target matching and the guarded starter"
```

---

### Task 3: Known games query

**Files:**
- Modify: `src/main/store/library-store.ts` (add `listKnownGames`)
- Test: `src/main/store/library-store.test.ts` (add one test; follow the file's existing helpers to seed rows)

**Interfaces:**
- Consumes: `KnownGame` from `@shared/launch` (Task 1).
- Produces: `listKnownGames(db: DatabaseSync): KnownGame[]`: one row per `platform_game`, `{ id, gameId, platform, externalId, title }`, ordered by id.

- [ ] **Step 1: Write the failing test** — in `library-store.test.ts`, seed two platform games using the helpers the file already uses (look at how existing tests insert an account, a `game` and `platform_game` rows), then:

```ts
  it('lists every platform game as a known game for install matching', () => {
    const db = freshDb()
    seedGame(db, { title: 'Half-Life 2', platform: 'steam', externalId: '220' })
    seedGame(db, { title: 'Fortnite', platform: 'epic', externalId: 'fn' })

    expect(listKnownGames(db)).toEqual([
      expect.objectContaining({ platform: 'steam', externalId: '220', title: 'Half-Life 2' }),
      expect.objectContaining({ platform: 'epic', externalId: 'fn', title: 'Fortnite' }),
    ])
  })
```

(Use the real helper names in `library-store.test.ts`; if none inserts a bare platform game, add a small local helper in the test file that inserts into `account`, `game` and `platform_game` with the columns from `0001_init.sql`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/store/library-store.test.ts`
Expected: FAIL (`listKnownGames` is not exported).

- [ ] **Step 3: Implement** — add to `library-store.ts`:

```ts
import type { KnownGame } from '@shared/launch'

export function listKnownGames(db: DatabaseSync): KnownGame[] {
  const rows = db
    .prepare(
      'SELECT id, game_id, platform, external_id, title FROM platform_game ORDER BY id',
    )
    .all() as unknown as {
    id: number
    game_id: number
    platform: Platform
    external_id: string
    title: string
  }[]
  return rows.map((row) => ({
    id: row.id,
    gameId: row.game_id,
    platform: row.platform,
    externalId: row.external_id,
    title: row.title,
  }))
}
```

(`Platform` is already imported in this file or add `import type { Platform } from '@shared/platform'`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/main/store/library-store.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/store
git commit -m "Add the known-games query used for install matching"
```

---

### Task 4: LaunchService

**Files:**
- Create: `src/main/launch/service.ts`
- Test: `src/main/launch/service.test.ts`

**Interfaces:**
- Consumes: `InstallAdapter`, `InstalledGame`, `LaunchTarget` (Task 2 `types.ts`), `matchInstalled`, `KnownGame` (Task 2/3), `startTarget`, `StartDeps` (Task 2), `InstalledEntry`, `PlayResult` (Task 1).
- Produces:
  ```ts
  interface LaunchServiceDeps {
    adapters: readonly InstallAdapter[]
    known: () => readonly KnownGame[]
    start: (target: LaunchTarget) => Promise<PlayResult>
    onChanged?: () => void
  }
  class LaunchService {
    constructor(deps: LaunchServiceDeps)
    scan(): Promise<void>
    installed(): InstalledEntry[]
    play(platformGameId: number): Promise<PlayResult>
  }
  ```

- [ ] **Step 1: Write the failing tests** — `src/main/launch/service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { KnownGame } from '@shared/launch'
import { LaunchService } from './service'
import type { InstallAdapter, InstalledGame } from './types'

const KNOWN: KnownGame[] = [
  { id: 7, gameId: 3, platform: 'steam', externalId: '220', title: 'Half-Life 2' },
  { id: 8, gameId: 4, platform: 'epic', externalId: 'fn', title: 'Fortnite' },
]

const STEAM_INSTALL: InstalledGame = {
  platform: 'steam',
  externalId: '220',
  title: 'Half-Life 2',
  target: { kind: 'uri', uri: 'steam://rungameid/220' },
}

function adapter(platform: InstallAdapter['platform'], games: InstalledGame[]): InstallAdapter {
  return { platform, findInstalled: vi.fn().mockResolvedValue(games) }
}

function service(over: Partial<ConstructorParameters<typeof LaunchService>[0]> = {}) {
  const start = vi.fn().mockResolvedValue({ ok: true })
  const onChanged = vi.fn()
  const svc = new LaunchService({
    adapters: [adapter('steam', [STEAM_INSTALL])],
    known: () => KNOWN,
    start,
    onChanged,
    ...over,
  })
  return { svc, start, onChanged }
}

describe('LaunchService', () => {
  it('reports nothing installed before the first scan', () => {
    expect(service().svc.installed()).toEqual([])
  })

  it('matches scanned installs to library games and announces the change', async () => {
    const { svc, onChanged } = service()

    await svc.scan()

    expect(svc.installed()).toEqual([{ gameId: 3, platformGameId: 7, platform: 'steam' }])
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('matches against the library as it is now, not as it was at scan time', async () => {
    let known: KnownGame[] = []
    const { svc } = service({ known: () => known })
    await svc.scan()
    expect(svc.installed()).toEqual([])

    known = KNOWN

    expect(svc.installed()).toHaveLength(1)
  })

  it('keeps going when one adapter fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: InstallAdapter = {
      platform: 'epic',
      findInstalled: vi.fn().mockRejectedValue(new Error('boom')),
    }
    const { svc } = service({ adapters: [broken, adapter('steam', [STEAM_INSTALL])] })

    await svc.scan()

    expect(svc.installed()).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('epic'))
    warn.mockRestore()
  })

  it('shares one scan between callers that overlap', async () => {
    const steam = adapter('steam', [STEAM_INSTALL])
    const { svc } = service({ adapters: [steam] })

    await Promise.all([svc.scan(), svc.scan()])

    expect(steam.findInstalled).toHaveBeenCalledOnce()
  })

  it('starts the target of an installed game', async () => {
    const { svc, start } = service()
    await svc.scan()

    await expect(svc.play(7)).resolves.toEqual({ ok: true })
    expect(start).toHaveBeenCalledWith({ kind: 'uri', uri: 'steam://rungameid/220' })
  })

  it('refuses a game that is not installed', async () => {
    const { svc, start } = service()
    await svc.scan()

    await expect(svc.play(8)).resolves.toEqual({
      ok: false,
      reason: 'That game is not installed.',
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('rescans after a failed start', async () => {
    const steam = adapter('steam', [STEAM_INSTALL])
    const start = vi.fn().mockResolvedValue({ ok: false, reason: 'Could not open the launcher.' })
    const { svc } = service({ adapters: [steam], start })
    await svc.scan()

    await svc.play(7)
    await vi.waitFor(() => expect(steam.findInstalled).toHaveBeenCalledTimes(2))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/launch/service.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/main/launch/service.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/main/launch && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/launch
git commit -m "Add the launch service that scans, matches and plays"
```

---

### Task 5: Steam install adapter

**Files:**
- Create: `src/main/launch/vdf.ts`
- Create: `src/main/launch/steam.ts`
- Test: `src/main/launch/vdf.test.ts`, `src/main/launch/steam.test.ts`

**Interfaces:**
- Consumes: `InstallAdapter`, `InstalledGame` (Task 2); `LocalFiles` (`src/main/providers/local-files.ts`); `STEAM_KEY` and `RegistryValue` from `src/main/providers/steam/local.ts`.
- Produces: `parseVdf(text: string): VdfObject`; `createSteamInstallAdapter(deps: SteamInstallDeps): InstallAdapter` where `SteamInstallDeps { readRegistry(key: string, name: string): Promise<RegistryValue>; files: Pick<LocalFiles, 'readText' | 'listFolder'> }`.

- [ ] **Step 1: Write the failing tests**

`src/main/launch/vdf.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { parseVdf } from './vdf'

describe('parseVdf', () => {
  it('reads nested objects and string values', () => {
    const text = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"
\t\t"apps"
\t\t{
\t\t\t"220"\t\t"1234"
\t\t}
\t}
}`

    expect(parseVdf(text)).toEqual({
      libraryfolders: {
        '0': { path: 'C:\\Program Files (x86)\\Steam', apps: { '220': '1234' } },
      },
    })
  })

  it('treats a quoted brace as text', () => {
    expect(parseVdf('"a" "{"')).toEqual({ a: '{' })
  })

  it('throws a parse error on an unclosed object', () => {
    expect(() => parseVdf('"a" { "b" "c"')).toThrow(ProviderError)
  })

  it('throws a parse error on a key with no value', () => {
    expect(() => parseVdf('"a"')).toThrow(ProviderError)
  })
})
```

`src/main/launch/steam.test.ts`:

```ts
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSteamInstallAdapter, type SteamInstallDeps } from './steam'

const STEAM = 'c:/program files (x86)/steam'
const LIBRARY = 'D:\\SteamLibrary'

const LIBRARY_FOLDERS = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"c:\\\\program files (x86)\\\\steam"
\t}
\t"1"
\t{
\t\t"path"\t\t"D:\\\\SteamLibrary"
\t}
}`

const manifest = (appid: string, name: string, flags: string): string =>
  `"AppState"
{
\t"appid"\t\t"${appid}"
\t"name"\t\t"${name}"
\t"StateFlags"\t\t"${flags}"
}`

function deps(files: Record<string, string>, folders: Record<string, string[]>): SteamInstallDeps {
  return {
    readRegistry: (_key, name) => Promise.resolve(name === 'SteamPath' ? STEAM : null),
    files: {
      readText: (path) => Promise.resolve(files[path] ?? null),
      listFolder: (path) =>
        Promise.resolve(
          folders[path]
            ? folders[path].map((name) => ({ name, isDirectory: false, modifiedAt: new Date(0) }))
            : null,
        ),
    },
  }
}

describe('createSteamInstallAdapter', () => {
  it('lists fully installed games across every library folder', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        {
          [join(STEAM, 'steamapps', 'libraryfolders.vdf')]: LIBRARY_FOLDERS,
          [join(STEAM, 'steamapps', 'appmanifest_220.acf')]: manifest('220', 'Half-Life 2', '4'),
          [join(LIBRARY, 'steamapps', 'appmanifest_1245620.acf')]: manifest(
            '1245620',
            'ELDEN RING',
            '4',
          ),
        },
        {
          [join(STEAM, 'steamapps')]: ['appmanifest_220.acf', 'libraryfolders.vdf'],
          [join(LIBRARY, 'steamapps')]: ['appmanifest_1245620.acf', 'notes.txt'],
        },
      ),
    )

    await expect(adapter.findInstalled()).resolves.toEqual([
      {
        platform: 'steam',
        externalId: '220',
        title: 'Half-Life 2',
        target: { kind: 'uri', uri: 'steam://rungameid/220' },
      },
      {
        platform: 'steam',
        externalId: '1245620',
        title: 'ELDEN RING',
        target: { kind: 'uri', uri: 'steam://rungameid/1245620' },
      },
    ])
  })

  it('skips games that are not fully installed yet', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        {
          [join(STEAM, 'steamapps', 'libraryfolders.vdf')]: LIBRARY_FOLDERS,
          [join(STEAM, 'steamapps', 'appmanifest_10.acf')]: manifest('10', 'Downloading', '1026'),
          [join(STEAM, 'steamapps', 'appmanifest_20.acf')]: manifest('20', 'Updating', '6'),
        },
        { [join(STEAM, 'steamapps')]: ['appmanifest_10.acf', 'appmanifest_20.acf'] },
      ),
    )

    const result = await adapter.findInstalled()

    expect(result.map((game) => game.externalId)).toEqual(['20'])
  })

  it('returns nothing when Steam is not installed', async () => {
    const adapter = createSteamInstallAdapter({
      readRegistry: () => Promise.resolve(null),
      files: { readText: () => Promise.resolve(null), listFolder: () => Promise.resolve(null) },
    })

    await expect(adapter.findInstalled()).resolves.toEqual([])
  })

  it('still finds the main library when libraryfolders.vdf is missing', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        { [join(STEAM, 'steamapps', 'appmanifest_220.acf')]: manifest('220', 'Half-Life 2', '4') },
        { [join(STEAM, 'steamapps')]: ['appmanifest_220.acf'] },
      ),
    )

    await expect(adapter.findInstalled()).resolves.toHaveLength(1)
  })

  it('skips a manifest it cannot read and carries on', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        {
          [join(STEAM, 'steamapps', 'appmanifest_1.acf')]: '"AppState" {',
          [join(STEAM, 'steamapps', 'appmanifest_220.acf')]: manifest('220', 'Half-Life 2', '4'),
        },
        { [join(STEAM, 'steamapps')]: ['appmanifest_1.acf', 'appmanifest_220.acf'] },
      ),
    )

    const result = await adapter.findInstalled()

    expect(result.map((game) => game.externalId)).toEqual(['220'])
  })

  it('ignores a manifest whose appid is not a number', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        {
          [join(STEAM, 'steamapps', 'appmanifest_9.acf')]: manifest('9; calc', 'Bad', '4'),
        },
        { [join(STEAM, 'steamapps')]: ['appmanifest_9.acf'] },
      ),
    )

    await expect(adapter.findInstalled()).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/launch/vdf.test.ts src/main/launch/steam.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/main/launch/vdf.ts`:

```ts
import { ProviderError } from '@shared/errors'

export type VdfValue = string | VdfObject
export interface VdfObject {
  [key: string]: VdfValue
}

type Token = { kind: 'text'; text: string } | { kind: 'open' } | { kind: 'close' }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '{') {
      tokens.push({ kind: 'open' })
      i++
    } else if (ch === '}') {
      tokens.push({ kind: 'close' })
      i++
    } else if (ch === '"') {
      let value = ''
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          i++
          const next = text[i]
          value += next === 'n' ? '\n' : next === 't' ? '\t' : (next ?? '')
        } else {
          value += text[i] ?? ''
        }
        i++
      }
      if (i >= text.length) throw new ProviderError('parse', 'Steam: unterminated string in a VDF file')
      i++
      tokens.push({ kind: 'text', text: value })
    } else {
      i++
    }
  }
  return tokens
}

export function parseVdf(text: string): VdfObject {
  const tokens = tokenize(text)
  let pos = 0

  function readObject(nested: boolean): VdfObject {
    const result: VdfObject = {}
    for (;;) {
      const key = tokens[pos++]
      if (key === undefined) {
        if (nested) throw new ProviderError('parse', 'Steam: unclosed object in a VDF file')
        return result
      }
      if (key.kind === 'close') {
        if (!nested) throw new ProviderError('parse', 'Steam: unexpected } in a VDF file')
        return result
      }
      if (key.kind === 'open') throw new ProviderError('parse', 'Steam: unexpected { in a VDF file')
      const value = tokens[pos++]
      if (value === undefined || value.kind === 'close') {
        throw new ProviderError('parse', `Steam: no value for "${key.text}" in a VDF file`)
      }
      result[key.text] = value.kind === 'open' ? readObject(true) : value.text
    }
  }

  return readObject(false)
}
```

`src/main/launch/steam.ts`:

```ts
import { join } from 'node:path'
import type { LocalFiles } from '../providers/local-files'
import { STEAM_KEY, type RegistryValue } from '../providers/steam/local'
import type { InstallAdapter, InstalledGame } from './types'
import { parseVdf, type VdfObject } from './vdf'

const MAX_MANIFEST_BYTES = 1_000_000
const INSTALLED_FLAG = 4
const MANIFEST_NAME = /^appmanifest_(\d+)\.acf$/

export interface SteamInstallDeps {
  readonly readRegistry: (key: string, name: string) => Promise<RegistryValue>
  readonly files: Pick<LocalFiles, 'readText' | 'listFolder'>
}

export function createSteamInstallAdapter(deps: SteamInstallDeps): InstallAdapter {
  return {
    platform: 'steam',
    async findInstalled() {
      const steamPath = await deps.readRegistry(STEAM_KEY, 'SteamPath')
      if (typeof steamPath !== 'string' || steamPath === '') return []
      const libraries = await libraryFolders(deps, steamPath)
      const found = await Promise.all(libraries.map((library) => installedIn(deps, library)))
      return found.flat()
    },
  }
}

async function libraryFolders(deps: SteamInstallDeps, steamPath: string): Promise<string[]> {
  const folders = new Set<string>([steamPath])
  try {
    const text = await deps.files.readText(
      join(steamPath, 'steamapps', 'libraryfolders.vdf'),
      MAX_MANIFEST_BYTES,
    )
    if (text !== null) {
      const root = parseVdf(text)['libraryfolders']
      if (typeof root === 'object') {
        for (const entry of Object.values(root)) {
          const path = typeof entry === 'string' ? entry : entry['path']
          if (typeof path === 'string' && path !== '') folders.add(path)
        }
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Launch: read only the main Steam library this time (${reason})`)
  }
  return [...folders]
}

async function installedIn(deps: SteamInstallDeps, library: string): Promise<InstalledGame[]> {
  const apps = join(library, 'steamapps')
  const entries = await deps.files.listFolder(apps)
  if (entries === null) return []
  const games = await Promise.all(
    entries
      .filter((entry) => MANIFEST_NAME.test(entry.name))
      .map((entry) => readManifest(deps, join(apps, entry.name))),
  )
  return games.filter((game) => game !== null)
}

async function readManifest(deps: SteamInstallDeps, path: string): Promise<InstalledGame | null> {
  try {
    const text = await deps.files.readText(path, MAX_MANIFEST_BYTES)
    if (text === null) return null
    const state = parseVdf(text)['AppState']
    return typeof state === 'object' ? toGame(state) : null
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Launch: skipped a Steam manifest (${reason})`)
    return null
  }
}

function toGame(state: VdfObject): InstalledGame | null {
  const appid = state['appid']
  const name = state['name']
  const flags = Number(state['StateFlags'])
  if (typeof appid !== 'string' || !/^\d+$/.test(appid) || typeof name !== 'string') return null
  if (!Number.isInteger(flags) || (flags & INSTALLED_FLAG) !== INSTALLED_FLAG) return null
  return {
    platform: 'steam',
    externalId: appid,
    title: name,
    target: { kind: 'uri', uri: `steam://rungameid/${appid}` },
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/main/launch && npm run typecheck && npm run lint`
Expected: PASS. If the `entry['path']` access on a `VdfValue` fails typecheck (string index on `string | VdfObject` narrowing), narrow with `typeof entry === 'object'` before indexing.

- [ ] **Step 5: Commit**

```bash
git add src/main/launch
git commit -m "Add the Steam install adapter and VDF parser"
```

---

### Task 6: Wire the service into the main process

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `LaunchService` (Task 4), `createSteamInstallAdapter` (Task 5), `startTarget`, `spawnDetached` (Task 2), `listKnownGames` (Task 3), `STEAM_LOCAL`, `LOCAL_FILES`, `IPC.installedChanged` (Task 1).
- Produces: real `getInstalled`, `playGame`, `rescanInstalled` handlers; initial scan, focus rescan.

- [ ] **Step 1: Add imports** to `src/main/index.ts` (grouped with the other `./` imports, and `access` to the `node:fs/promises` import):

```ts
import { access, mkdir, writeFile } from 'node:fs/promises'
import { createSteamInstallAdapter } from './launch/steam'
import { LaunchService } from './launch/service'
import { spawnDetached } from './launch/spawn'
import { startTarget } from './launch/start'
import { LOCAL_FILES } from './providers/local-files'
import { STEAM_LOCAL } from './providers/steam/local'
```

(Skip any import that already exists. `listKnownGames` goes into the existing `./store/library-store` import list.)

- [ ] **Step 2: Create the service** right after the `dataChanged` definition (so it can send to the window):

```ts
  const launcher = new LaunchService({
    adapters: [
      createSteamInstallAdapter({ readRegistry: STEAM_LOCAL.readRegistry, files: LOCAL_FILES }),
    ],
    known: () => listKnownGames(db),
    start: (target) =>
      startTarget(target, {
        openExternal: (uri) => shell.openExternal(uri),
        spawnProgram: spawnDetached,
        fileExists: (path) =>
          access(path).then(
            () => true,
            () => false,
          ),
      }),
    onChanged: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.installedChanged)
      }
    },
  })
```

- [ ] **Step 3: Replace the Task 1 stubs** in the handlers object:

```ts
    getInstalled: () => launcher.installed(),
    playGame: (platformGameId) => launcher.play(platformGameId),
    rescanInstalled: async () => {
      await launcher.scan()
      return launcher.installed()
    },
```

- [ ] **Step 4: Scan at startup and on focus.** Near the end of startup (just before `console.info('Ready in the tray')`):

```ts
  setTimeout(() => void launcher.scan(), 10_000)
  let lastFocusScan = 0
  app.on('browser-window-focus', () => {
    const now = Date.now()
    if (now - lastFocusScan < 60_000) return
    lastFocusScan = now
    void launcher.scan()
  })
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.
Then run the built app once to confirm startup is unaffected: `npm run build`, then in PowerShell `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npm start`, wait 15 s, and check the newest lines of `%APPDATA%\trophy-locker\logs\trophy-locker.log` contain `Ready in the tray` and no `Launch:` warning other than expected ones. Quit the app from the tray.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "Run the launch service in the main process"
```

---

### Task 7: Renderer: Play buttons and the Installed filter

**Files:**
- Create: `src/renderer/src/features/launch/useInstalled.ts`
- Create: `src/renderer/src/features/launch/launch-labels.ts`
- Create: `src/renderer/src/features/game-detail/PlayButtons.tsx`
- Modify: `src/renderer/src/features/game-detail/GameDetail.tsx` (render `PlayButtons` in `actions`)
- Modify: `src/renderer/src/features/library/library-view.ts` (`installed` flag, `applyView` and `isFiltered`)
- Modify: `src/renderer/src/features/library/Library.tsx` (Installed toggle, `useInstalled`)
- Test: `src/renderer/src/features/launch/launch-labels.test.ts`, `src/renderer/src/features/game-detail/PlayButtons.test.tsx`, `src/renderer/src/features/library/library-view.test.ts`, `src/renderer/src/features/library/Library.test.tsx`

**Interfaces:**
- Consumes: `window.api.getInstalled/playGame/onInstalledChanged/onDataChanged`, `InstalledEntry`, `PlayResult` (Task 1), `GLASS_BUTTON` from `GameBanner`, `platformName`.
- Produces: `useInstalled(): InstalledEntry[] | null`; `playLabel(platform, count): string`; `LibraryView.installed: boolean`; `applyView(games, view, installedGameIds?: ReadonlySet<number>)`.

- [ ] **Step 1: Write the failing tests**

`launch-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { playLabel } from './launch-labels'

describe('playLabel', () => {
  it('is just Play when there is one install', () => {
    expect(playLabel('steam', 1)).toBe('Play')
  })

  it('names the platform when there are several installs', () => {
    expect(playLabel('epic', 2)).toBe('Play on Epic Games')
  })
})
```

`PlayButtons.test.tsx` (`// @vitest-environment jsdom` header, same imports as other component tests):

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstalledEntry } from '@shared/launch'
import { fakeApi } from '@/test/fake-api'
import { PlayButtons } from './PlayButtons'

const STEAM: InstalledEntry = { gameId: 3, platformGameId: 7, platform: 'steam' }
const EPIC: InstalledEntry = { gameId: 3, platformGameId: 8, platform: 'epic' }

beforeEach(() => {
  window.api = fakeApi()
})
afterEach(cleanup)

function renderButtons(installed: InstalledEntry[] | null, entryIds = [7, 8]) {
  return render(<PlayButtons installed={installed} entryIds={entryIds} />)
}

describe('PlayButtons', () => {
  it('shows nothing before the first scan result', () => {
    renderButtons(null)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing when none of this game is installed', () => {
    renderButtons([{ gameId: 9, platformGameId: 99, platform: 'steam' }])

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a single Play button and starts the game', async () => {
    renderButtons([STEAM])

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    await waitFor(() => expect(window.api.playGame).toHaveBeenCalledWith(7))
  })

  it('shows one button per install when there are several', () => {
    renderButtons([STEAM, EPIC])

    expect(screen.getByRole('button', { name: 'Play on Steam' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play on Epic Games' })).toBeInTheDocument()
  })

  it('shows the reason when a game could not be started', async () => {
    window.api = fakeApi({
      playGame: vi.fn().mockResolvedValue({ ok: false, reason: 'Could not open the launcher.' }),
    })
    renderButtons([STEAM])

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open the launcher.')
  })

  it('shows a generic message when the call itself fails', async () => {
    window.api = fakeApi({ playGame: vi.fn().mockRejectedValue(new Error('ipc')) })
    renderButtons([STEAM])

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('disables the button while a start is in flight', async () => {
    window.api = fakeApi({ playGame: vi.fn().mockReturnValue(new Promise(() => {})) })
    renderButtons([STEAM])

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(await screen.findByRole('button', { name: 'Starting…' })).toBeDisabled()
  })
})
```

Add to `library-view.test.ts`:

```ts
  it('keeps only installed games when the Installed filter is on', () => {
    const games = [game({ id: 1 }), game({ id: 2 })]

    const shown = applyView(games, { ...DEFAULT_VIEW, installed: true }, new Set([2]))

    expect(shown.map((g) => g.id)).toEqual([2])
  })

  it('ignores the installed set when the filter is off', () => {
    const games = [game({ id: 1 }), game({ id: 2 })]

    expect(applyView(games, DEFAULT_VIEW, new Set([2]))).toHaveLength(2)
  })

  it('counts the Installed filter as a filter', () => {
    expect(isFiltered({ ...DEFAULT_VIEW, installed: true })).toBe(true)
  })

  it('clears the Installed filter with the others', () => {
    expect(clearFilters({ ...DEFAULT_VIEW, installed: true }).installed).toBe(false)
  })
```

(Use the file's existing game factory; if it is not called `game`, use the existing name.)

Add to `Library.test.tsx`: a test that with `getInstalled` resolving `[{ gameId: <id of one of the test games>, platformGameId: 1, platform: 'steam' }]`, clicking the **Installed** toggle button shows only that game, and that with nothing installed the **Installed** option is disabled. Follow the file's existing render helper and game fixtures.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/src/features`
Expected: FAIL (modules and fields missing).

- [ ] **Step 3: Implement**

`launch-labels.ts`:

```ts
import { platformName, type Platform } from '@shared/platform'

export function playLabel(platform: Platform, installCount: number): string {
  return installCount > 1 ? `Play on ${platformName(platform)}` : 'Play'
}
```

`useInstalled.ts`:

```ts
import { useEffect, useState } from 'react'
import type { InstalledEntry } from '@shared/launch'

export function useInstalled() {
  const [installed, setInstalled] = useState<InstalledEntry[] | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    window.api.getInstalled().then(
      (data) => {
        if (!cancelled) setInstalled(data)
      },
      () => {
        if (!cancelled) setInstalled([])
      },
    )
    return () => {
      cancelled = true
    }
  }, [version])

  useEffect(() => {
    const reload = () => setVersion((v) => v + 1)
    const offInstalled = window.api.onInstalledChanged(reload)
    const offData = window.api.onDataChanged(reload)
    return () => {
      offInstalled()
      offData()
    }
  }, [])

  return installed
}
```

`PlayButtons.tsx`:

```tsx
import { Play } from 'lucide-react'
import { useState } from 'react'
import type { InstalledEntry } from '@shared/launch'
import { playLabel } from '../launch/launch-labels'
import { GLASS_BUTTON } from './GameBanner'

interface PlayButtonsProps {
  installed: readonly InstalledEntry[] | null
  entryIds: readonly number[]
}

export function PlayButtons({ installed, entryIds }: PlayButtonsProps) {
  const [starting, setStarting] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const options = (installed ?? []).filter((item) => entryIds.includes(item.platformGameId))
  if (options.length === 0) return null

  async function play(platformGameId: number) {
    setProblem(null)
    setStarting(platformGameId)
    try {
      const result = await window.api.playGame(platformGameId)
      if (!result.ok) setProblem(result.reason)
    } catch {
      setProblem('Something went wrong while starting the game. Try again.')
    } finally {
      setStarting(null)
    }
  }

  return (
    <>
      {options.map((item) => (
        <button
          key={item.platformGameId}
          type="button"
          disabled={starting !== null}
          onClick={() => void play(item.platformGameId)}
          className={GLASS_BUTTON}
        >
          <Play aria-hidden="true" className="size-3.5" />
          {starting === item.platformGameId
            ? 'Starting…'
            : playLabel(item.platform, options.length)}
        </button>
      ))}
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
    </>
  )
}
```

`GameDetail.tsx`: import `useInstalled` and `PlayButtons`; in `GameDetail` add `const installed = useInstalled()` next to `useGame` (hooks must run before the early returns, so place it directly after `const { detail, reload } = useGame(id)`); inside the `actions` fragment, first child:

```tsx
      <PlayButtons installed={installed} entryIds={entries.map((e) => e.platformGameId)} />
```

`library-view.ts`: add `readonly installed: boolean` to `LibraryView`, `installed: false` to `DEFAULT_VIEW`; change `applyView`, `countMatching` and `matches`:

```ts
export function applyView(
  games: readonly LibraryGame[],
  view: LibraryView,
  installedGameIds: ReadonlySet<number> = new Set(),
): LibraryGame[] {
  const words = searchWords(view.query)
  return games
    .filter((game) => matches(game, view, words, installedGameIds))
    .sort(SORTS[view.sort].compare)
}

export function isFiltered(view: LibraryView): boolean {
  return (
    view.query.trim() !== '' ||
    view.platform !== 'all' ||
    view.status !== 'all' ||
    view.installed
  )
}

function matches(
  game: LibraryGame,
  view: LibraryView,
  words: readonly string[],
  installedGameIds: ReadonlySet<number>,
): boolean {
  return (
    (view.platform === 'all' || game.platforms.includes(view.platform)) &&
    STATUSES[view.status].keep(game) &&
    (!view.installed || installedGameIds.has(game.id)) &&
    matchesSearch(game.title, words)
  )
}
```

and `countMatching(games, view, installedGameIds = new Set())` passes the set the same way. `clearFilters` already spreads `DEFAULT_VIEW`, so `installed` resets.

`Library.tsx`: `const installed = useInstalled()` beside `useLibrary()` (before the early returns); after `const update = ...`:

```tsx
  const installedGameIds = new Set((installed ?? []).map((entry) => entry.gameId))
  const shown = applyView(games, view, installedGameIds)
```

and in the filter bar, inside the right-hand `div`, before the Progress `Select`:

```tsx
          <ToggleGroup
            label="Installed"
            variant="segmented"
            options={[
              { value: 'all', label: 'All' },
              { value: 'installed', label: 'Installed', disabled: installedGameIds.size === 0 },
            ]}
            selected={view.installed ? 'installed' : 'all'}
            onSelect={(next) => update({ installed: next === 'installed' })}
          />
```

(Check `ToggleGroup`'s option type in `src/renderer/src/components/ToggleGroup.tsx`: if options have no `disabled` field, add an optional `disabled?: boolean` to its option interface, render it as a disabled button, and add a test to `ToggleGroup`'s existing test file asserting a disabled option cannot be selected.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/renderer && npm run typecheck && npm run lint && npm run format:check`
Expected: PASS. Existing tests that build a `LibraryView` literal without `installed` need `installed: false` added.

- [ ] **Step 5: Commit**

```bash
git add src/renderer
git commit -m "Add Play buttons to Game detail and an Installed filter to the Library"
```

---

### Task 8: Docs and the ADR

**Files:**
- Create: `docs/adr/0017-launching-installed-games.md`
- Modify: `docs/superpowers/specs/2026-10-05-launch-games-design.md` (the three deviations listed under Global Constraints)
- Modify: `docs/SPEC.md` (IPC table rows), `docs/PROJECT-MAP.md`, `docs/ARCHITECTURE.md`, `docs/PROVIDERS.md` (Steam section: install detection and launch), `docs/ROADMAP.md`, `CLAUDE.md` (test count, ADR list)

**Interfaces:** none (documentation).

- [ ] **Step 1: Write ADR-0017** following the format of ADR-0016 (Status, Date, Context, Options considered, Decision, Consequences). Record: launching only through the platform's launcher or the emulator (rule 4); installs scanned in memory and matched to the library on demand (no schema change) with the rejected "store installs in SQLite" option; the renderer sends only `platformGameId`; adapters per source; unverified adapters marked as such.
- [ ] **Step 2: Update the spec** so it matches what was built: one button per install instead of a menu; `getInstalled()` entries are `{ gameId, platformGameId, platform }`; scans run at startup, on window focus (at most once a minute) and after a failed Play, with no Rescan button yet (the `rescanInstalled` call exists for the emulator card work).
- [ ] **Step 3: Update the other docs.** SPEC IPC table (`launch:get-installed`, `launch:play`, `launch:rescan`, push `launch:installed-changed`), PROJECT-MAP (every new file under `src/main/launch/`, `features/launch/`, `PlayButtons.tsx`, and where to work to add an adapter), ARCHITECTURE (launch module in the main process area), PROVIDERS.md Steam (install detection verified on 2 October 2026: registry `SteamPath`, `libraryfolders.vdf`, `appmanifest_*.acf` with `StateFlags` bit 4, `steam://rungameid/<appid>`; add the date the owner starts one game from the app by hand and what happened, or "launch by hand: pending"), ROADMAP (tick the base and Steam items under "After v1: launch installed games", leave the others), CLAUDE.md (test count from `npm test`, add 0017 to the ADR list, add the launch module to Status).
- [ ] **Step 4: Verify** — `npm run format:check` (it does not touch `.md`), `npm run lint`, `npm run typecheck`, `npm test`. Do **not** run Prettier on the markdown files.
- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md
git commit -m "Document the launch module and record ADR-0017"
```

---

## Self-review

- **Spec coverage:** sections 1 (module, Steam adapter, matching, scanning), 2 (starting), 4 (IPC, minus the emulator calls which belong to the emulator phase), 5 (Game detail Play, Library Installed filter), 6 (errors: launcher missing, game uninstalled via `That game is not installed.` plus rescan, adapter failures logged), and the phase-1/2 part of section 7 are covered. Emulator programs (section 3), Ubisoft, Epic, EA, Xbox, RPCS3 and shadPS4 adapters are later plans.
- **Placeholders:** none; tests that depend on existing fixtures (Task 3 helper, Task 7 `Library.test.tsx`) say exactly what to assert and where to find the helper.
- **Types:** `InstalledEntry`, `PlayResult`, `KnownGame` (shared, Task 3 moves it), `LaunchTarget`, `InstalledGame`, `InstallAdapter`, `LaunchService` method names, `playLabel`, `useInstalled` are used consistently across tasks.
