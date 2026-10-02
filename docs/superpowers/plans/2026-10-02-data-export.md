# Data export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings gets a "Your data" card whose **Export data…** button saves one JSON file with every game, achievement and unlock, and no credentials or platform account ids.

**Architecture:** A read-only SQL module (`store/export-store.ts`) builds a typed `DataExport` object. A small `DataExporter` in the main process asks for a save path, writes the file, and returns an `ExportResult`. One no-payload IPC call carries it to a Settings card. The dialog and the file write are injected so everything but the card's wiring is tested without Electron.

**Tech Stack:** TypeScript strict, `node:sqlite`, Electron `dialog`, React, Vitest (Node and jsdom).

**Spec:** [docs/superpowers/specs/2026-10-02-data-export-design.md](../specs/2026-10-02-data-export-design.md)

## Global Constraints

- No code comments (owner's choice). Explanations go in `docs/PROJECT-MAP.md`.
- Prettier: no semicolons, single quotes. `npm run lint` allows zero warnings. TypeScript strict, `noUncheckedIndexedAccess`, no `any`.
- SQL only in `src/main/store` (rule 8). No schema change in this work, so no migration.
- Secrets never leave the `SecretStore` (rule 3); the export reads SQLite only and omits every `account.external_id` and every `platform_game.external_id` and `achievement.external_id`.
- New renderer capabilities go `shared/ipc.ts` then `main/ipc.ts` (validate the sender) then `preload/index.ts` (rule 9). The renderer sends no payload, so it cannot choose where the file is written.
- Styling: Tailwind utilities with design tokens only, no hard-coded hex. Never name a colour token `base`, `sm`, `lg`, `xl`.
- Tests are written by Claude. CI runs `en-US`, local is `en-ZA`: do not assert localized dates or numbers.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: The export shape and the SQL that builds it

**Files:**
- Create: `src/shared/data-export.ts`
- Create: `src/main/store/export-store.ts`
- Test: `src/main/store/export-store.test.ts`

**Interfaces:**
- Produces (`src/shared/data-export.ts`): `DataExport` and the interfaces below.
- Produces (`src/main/store/export-store.ts`): `buildDataExport(db: DatabaseSync, meta: ExportMeta): DataExport`, and `interface ExportMeta { readonly appVersion: string; readonly schemaVersion: number; readonly exportedAt: Date }`.

- [ ] **Step 1: Write the shared types**

Create `src/shared/data-export.ts`:

```ts
import type { Platform } from './platform'

export const DATA_EXPORT_FORMAT = 1

export interface ExportedUnlock {
  readonly unlockedAt: string | null
  readonly detectedAt: string
  readonly progressCurrent: number | null
  readonly progressMax: number | null
}

export interface ExportedAchievement {
  readonly id: number
  readonly name: string
  readonly description: string | null
  readonly iconUrl: string | null
  readonly iconLockedUrl: string | null
  readonly hidden: boolean
  readonly points: number | null
  readonly tier: string | null
  readonly globalPercent: number | null
  readonly unlock: ExportedUnlock | null
}

export interface ExportedPlatinum {
  readonly earnedAt: string | null
  readonly detectedAt: string
}

export interface ExportedEntry {
  readonly id: number
  readonly accountId: number
  readonly platform: Platform
  readonly title: string
  readonly iconUrl: string | null
  readonly coverUrl: string | null
  readonly portraitUrl: string | null
  readonly heroUrl: string | null
  readonly storeUrl: string | null
  readonly lastPlayed: string | null
  readonly linked: string
  readonly platinum: ExportedPlatinum | null
  readonly achievements: readonly ExportedAchievement[]
}

export interface ExportedGame {
  readonly id: number
  readonly title: string
  readonly releaseYear: number | null
  readonly coverUrl: string | null
  readonly entries: readonly ExportedEntry[]
}

export interface ExportedAccount {
  readonly id: number
  readonly platform: Platform
  readonly displayName: string
  readonly status: string
  readonly lastSyncAt: string | null
  readonly createdAt: string
}

export interface ExportedAlias {
  readonly matchKey: string
  readonly gameId: number
}

export interface DataExport {
  readonly format: typeof DATA_EXPORT_FORMAT
  readonly exportedAt: string
  readonly app: { readonly version: string; readonly schemaVersion: number }
  readonly accounts: readonly ExportedAccount[]
  readonly games: readonly ExportedGame[]
  readonly aliases: readonly ExportedAlias[]
  readonly settings: Readonly<Record<string, unknown>>
}
```

- [ ] **Step 2: Write the failing test**

Create `src/main/store/export-store.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RemoteAchievement, RemoteGame } from '@shared/models'
import { buildDataExport, type ExportMeta } from './export-store'
import { applyMigrations } from './migrate'
import { awardPlatinums } from './platinum'
import {
  addPlatformGames,
  getPlatformGameByExternalId,
  insertNewUnlocks,
  upsertAccount,
  upsertAchievements,
} from './sync-store'

const NOW = new Date('2026-10-02T12:00:00.000Z')
const META: ExportMeta = { appVersion: '0.1.0', schemaVersion: 8, exportedAt: NOW }
const ACCOUNT_EXTERNAL_ID = 'steamid-7656119800000000'
const GAME_EXTERNAL_ID = 'appid-424242'

let db: DatabaseSync

function game(externalId: string, title: string): RemoteGame {
  return {
    ref: { externalId },
    title,
    iconUrl: `https://icon/${externalId}.jpg`,
    coverUrl: `https://cover/${externalId}.jpg`,
    lastPlayed: new Date('2026-09-30T10:00:00.000Z'),
    recentlyPlayed: true,
  }
}

function achievement(externalId: string, overrides: Partial<RemoteAchievement> = {}) {
  return {
    externalId,
    name: `Achievement ${externalId}`,
    description: `Do ${externalId}`,
    iconUrl: null,
    iconLockedUrl: null,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: 12.5,
    ...overrides,
  } satisfies RemoteAchievement
}

function seed(): { accountId: number; platformGameId: number } {
  const account = upsertAccount(db, {
    platform: 'steam',
    externalId: ACCOUNT_EXTERNAL_ID,
    displayName: 'Player',
  })
  addPlatformGames(db, account, [game(GAME_EXTERNAL_ID, 'Portal')])
  const { id } = getPlatformGameByExternalId(db, account.id, GAME_EXTERNAL_ID)
  upsertAchievements(db, id, [
    achievement(`${GAME_EXTERNAL_ID}-0`, { tier: 'gold', points: 50 }),
    achievement(`${GAME_EXTERNAL_ID}-1`, { hidden: true }),
  ])
  insertNewUnlocks(db, id, [
    {
      achievementExternalId: `${GAME_EXTERNAL_ID}-0`,
      unlockedAt: new Date('2026-09-29T08:00:00.000Z'),
      progress: { current: 3, max: 5 },
    },
  ])
  return { accountId: account.id, platformGameId: id }
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  applyMigrations(db)
})

describe('buildDataExport', () => {
  it('exports an empty database as empty lists', () => {
    expect(buildDataExport(db, META)).toEqual({
      format: 1,
      exportedAt: '2026-10-02T12:00:00.000Z',
      app: { version: '0.1.0', schemaVersion: 8 },
      accounts: [],
      games: [],
      aliases: [],
      settings: {},
    })
  })

  it('exports an account without its platform id', () => {
    seed()

    const [account] = buildDataExport(db, META).accounts

    expect(account).toMatchObject({ platform: 'steam', displayName: 'Player', status: 'connected' })
    expect(account).not.toHaveProperty('externalId')
  })

  it('exports a game with its platform entry, achievements and unlocks', () => {
    const { accountId } = seed()

    const [exported] = buildDataExport(db, META).games
    const [entry] = exported?.entries ?? []

    expect(exported).toMatchObject({ title: 'Portal', releaseYear: null })
    expect(entry).toMatchObject({
      accountId,
      platform: 'steam',
      title: 'Portal',
      lastPlayed: '2026-09-30T10:00:00.000Z',
      linked: 'auto',
      platinum: null,
    })
    expect(entry?.achievements).toHaveLength(2)
    expect(entry?.achievements[0]).toMatchObject({
      name: `Achievement ${GAME_EXTERNAL_ID}-0`,
      tier: 'gold',
      points: 50,
      hidden: false,
      globalPercent: 12.5,
      unlock: {
        unlockedAt: '2026-09-29T08:00:00.000Z',
        progressCurrent: 3,
        progressMax: 5,
      },
    })
    expect(entry?.achievements[1]).toMatchObject({ hidden: true, unlock: null })
  })

  it('exports a platinum the app awarded', () => {
    const { platformGameId } = seed()
    insertNewUnlocks(db, platformGameId, [
      { achievementExternalId: `${GAME_EXTERNAL_ID}-1`, unlockedAt: NOW, progress: null },
    ])
    awardPlatinums(db, NOW)

    const [entry] = buildDataExport(db, META).games[0]?.entries ?? []

    expect(entry?.platinum).toEqual({ earnedAt: expect.any(String), detectedAt: expect.any(String) })
  })

  it('exports the links the user made by hand', () => {
    seed()
    db.prepare('INSERT INTO game_alias (match_key, game_id) VALUES (?, ?)').run('portal', 1)

    expect(buildDataExport(db, META).aliases).toEqual([{ matchKey: 'portal', gameId: 1 }])
  })

  it('exports settings with their JSON values parsed, and keeps text that is not JSON', () => {
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run('a.flag', 'true')
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run('b.object', '{"x":1}')
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run('c.text', 'not json')

    expect(buildDataExport(db, META).settings).toEqual({
      'a.flag': true,
      'b.object': { x: 1 },
      'c.text': 'not json',
    })
  })

  it('never writes a platform account id, game id or achievement id', () => {
    seed()

    const text = JSON.stringify(buildDataExport(db, META))

    expect(text).not.toContain(ACCOUNT_EXTERNAL_ID)
    expect(text).not.toContain(GAME_EXTERNAL_ID)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/main/store/export-store.test.ts`
Expected: FAIL, "Failed to resolve import ./export-store".

- [ ] **Step 4: Write the implementation**

Create `src/main/store/export-store.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import {
  DATA_EXPORT_FORMAT,
  type DataExport,
  type ExportedAccount,
  type ExportedAchievement,
  type ExportedAlias,
  type ExportedEntry,
  type ExportedGame,
} from '@shared/data-export'
import type { Platform } from '@shared/platform'

export interface ExportMeta {
  readonly appVersion: string
  readonly schemaVersion: number
  readonly exportedAt: Date
}

interface AccountRow {
  id: number
  platform: Platform
  display_name: string
  status: string
  last_sync_at: string | null
  created_at: string
}

interface GameRow {
  id: number
  title: string
  release_year: number | null
  cover_url: string | null
}

interface EntryRow {
  id: number
  game_id: number
  account_id: number
  platform: Platform
  title: string
  icon_url: string | null
  cover_url: string | null
  portrait_url: string | null
  hero_url: string | null
  store_url: string | null
  last_played: string | null
  linked: string
  has_platinum: number
  platinum_earned_at: string | null
  platinum_detected_at: string | null
}

interface AchievementRow {
  id: number
  platform_game_id: number
  name: string
  description: string | null
  icon_url: string | null
  icon_locked_url: string | null
  hidden: number
  points: number | null
  tier: string | null
  global_percent: number | null
  has_unlock: number
  unlocked_at: string | null
  detected_at: string | null
  progress_cur: number | null
  progress_max: number | null
}

interface AliasRow {
  match_key: string
  game_id: number
}

interface SettingRow {
  key: string
  value: string
}

export function buildDataExport(db: DatabaseSync, meta: ExportMeta): DataExport {
  return {
    format: DATA_EXPORT_FORMAT,
    exportedAt: meta.exportedAt.toISOString(),
    app: { version: meta.appVersion, schemaVersion: meta.schemaVersion },
    accounts: readAccounts(db),
    games: readGames(db),
    aliases: readAliases(db),
    settings: readSettings(db),
  }
}

function readAccounts(db: DatabaseSync): ExportedAccount[] {
  const rows = db
    .prepare(
      'SELECT id, platform, display_name, status, last_sync_at, created_at FROM account ORDER BY id',
    )
    .all() as unknown as AccountRow[]
  return rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    displayName: row.display_name,
    status: row.status,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
  }))
}

function readGames(db: DatabaseSync): ExportedGame[] {
  const games = db
    .prepare('SELECT id, title, release_year, cover_url FROM game ORDER BY id')
    .all() as unknown as GameRow[]
  const entriesByGame = groupBy(readEntries(db), (entry) => entry.gameId)
  return games.map((game) => ({
    id: game.id,
    title: game.title,
    releaseYear: game.release_year,
    coverUrl: game.cover_url,
    entries: (entriesByGame.get(game.id) ?? []).map(({ entry }) => entry),
  }))
}

function readEntries(db: DatabaseSync): { gameId: number; entry: ExportedEntry }[] {
  const rows = db
    .prepare(
      `SELECT pg.id, pg.game_id, pg.account_id, pg.platform, pg.title, pg.icon_url, pg.cover_url,
              pg.portrait_url, pg.hero_url, pg.store_url, pg.last_played, pg.linked,
              (p.platform_game_id IS NOT NULL) AS has_platinum,
              p.earned_at AS platinum_earned_at, p.detected_at AS platinum_detected_at
       FROM platform_game pg
       LEFT JOIN platinum p ON p.platform_game_id = pg.id
       ORDER BY pg.id`,
    )
    .all() as unknown as EntryRow[]
  const achievements = groupBy(readAchievements(db), (achievement) => achievement.platformGameId)
  return rows.map((row) => ({
    gameId: row.game_id,
    entry: {
      id: row.id,
      accountId: row.account_id,
      platform: row.platform,
      title: row.title,
      iconUrl: row.icon_url,
      coverUrl: row.cover_url,
      portraitUrl: row.portrait_url,
      heroUrl: row.hero_url,
      storeUrl: row.store_url,
      lastPlayed: row.last_played,
      linked: row.linked,
      platinum: row.has_platinum
        ? { earnedAt: row.platinum_earned_at, detectedAt: row.platinum_detected_at ?? '' }
        : null,
      achievements: (achievements.get(row.id) ?? []).map(({ achievement }) => achievement),
    },
  }))
}

function readAchievements(
  db: DatabaseSync,
): { platformGameId: number; achievement: ExportedAchievement }[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.platform_game_id, a.name, a.description, a.icon_url, a.icon_locked_url,
              a.hidden, a.points, a.tier, a.global_percent,
              (u.id IS NOT NULL) AS has_unlock, u.unlocked_at, u.detected_at,
              u.progress_cur, u.progress_max
       FROM achievement a
       LEFT JOIN unlock u ON u.achievement_id = a.id
       ORDER BY a.id`,
    )
    .all() as unknown as AchievementRow[]
  return rows.map((row) => ({
    platformGameId: row.platform_game_id,
    achievement: {
      id: row.id,
      name: row.name,
      description: row.description,
      iconUrl: row.icon_url,
      iconLockedUrl: row.icon_locked_url,
      hidden: row.hidden === 1,
      points: row.points,
      tier: row.tier,
      globalPercent: row.global_percent,
      unlock: row.has_unlock
        ? {
            unlockedAt: row.unlocked_at,
            detectedAt: row.detected_at ?? '',
            progressCurrent: row.progress_cur,
            progressMax: row.progress_max,
          }
        : null,
    },
  }))
}

function readAliases(db: DatabaseSync): ExportedAlias[] {
  const rows = db
    .prepare('SELECT match_key, game_id FROM game_alias ORDER BY match_key')
    .all() as unknown as AliasRow[]
  return rows.map((row) => ({ matchKey: row.match_key, gameId: row.game_id }))
}

function readSettings(db: DatabaseSync): Record<string, unknown> {
  const rows = db
    .prepare('SELECT key, value FROM setting ORDER BY key')
    .all() as unknown as SettingRow[]
  return Object.fromEntries(rows.map((row) => [row.key, parseValue(row.value)]))
}

function parseValue(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const group = groups.get(key(item))
    if (group) group.push(item)
    else groups.set(key(item), [item])
  }
  return groups
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/main/store/export-store.test.ts`
Expected: PASS (7 tests). If `awardPlatinums` has a different signature, read `src/main/store/platinum.ts` and adjust only the call in the platinum test, keeping its assertion.

- [ ] **Step 6: Check, then commit**

Run: `npx prettier --write src/shared/data-export.ts src/main/store/export-store.ts src/main/store/export-store.test.ts && npm run lint && npm run typecheck`
Expected: no output from lint and typecheck beyond their banners.

```bash
git add src/shared/data-export.ts src/main/store/export-store.ts src/main/store/export-store.test.ts
git commit -m "Build the data export from the database

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The exporter and its IPC call

**Files:**
- Create: `src/main/data-export.ts`
- Test: `src/main/data-export.test.ts`
- Modify: `src/shared/ipc.ts` (add `exportData` channel, `ExportResult`, and the `Api` method)
- Modify: `src/main/ipc.ts` (handler type and registration)
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/test/fake-api.ts`
- Modify: `src/main/ipc.test.ts`

**Interfaces:**
- Consumes: `buildDataExport(db, meta)` and `ExportMeta` (Task 1); `AppInfo` from `@shared/ipc`.
- Produces: `class DataExporter` with `run(): Promise<ExportResult>`; `type ExportResult = { readonly kind: 'saved'; readonly path: string; readonly games: number; readonly achievements: number } | { readonly kind: 'cancelled' } | { readonly kind: 'failed'; readonly message: string }` in `src/shared/ipc.ts`; `IPC.exportData = 'data:export'`; `window.api.exportData(): Promise<ExportResult>`.

- [ ] **Step 1: Add the shared contract**

In `src/shared/ipc.ts`, add after `AppInfo`:

```ts
export type ExportResult =
  | {
      readonly kind: 'saved'
      readonly path: string
      readonly games: number
      readonly achievements: number
    }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly message: string }
```

Add to the `IPC` table, after `connectRpcs3: 'accounts:connect-rpcs3',`:

```ts
  exportData: 'data:export',
```

Add to the `Api` interface (the one that lists `findRpcs3()` and the other methods), after `connectRpcs3(...)`:

```ts
  exportData(): Promise<ExportResult>
```

- [ ] **Step 2: Write the failing exporter test**

Create `src/main/data-export.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataExporter } from './data-export'
import { applyMigrations } from './store/migrate'
import { addPlatformGames, upsertAccount } from './store/sync-store'

const NOW = new Date('2026-10-02T12:00:00.000Z')

let db: DatabaseSync
const chooseFile = vi.fn<(defaultName: string) => Promise<string | null>>()
const writeFile = vi.fn<(path: string, text: string) => Promise<void>>()

function exporter(): DataExporter {
  return new DataExporter({
    db,
    appInfo: () => ({ version: '0.1.0', schemaVersion: 8 }),
    chooseFile,
    writeFile,
    now: () => NOW,
  })
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  applyMigrations(db)
  chooseFile.mockReset()
  writeFile.mockReset()
  writeFile.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DataExporter', () => {
  it('suggests a file name with the date', async () => {
    chooseFile.mockResolvedValue(null)

    await exporter().run()

    expect(chooseFile).toHaveBeenCalledWith('trophy-locker-export-2026-10-02.json')
  })

  it('writes nothing when the dialog is cancelled', async () => {
    chooseFile.mockResolvedValue(null)

    await expect(exporter().run()).resolves.toEqual({ kind: 'cancelled' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('writes the export as JSON to the chosen path and reports the counts', async () => {
    const account = upsertAccount(db, { platform: 'steam', externalId: 'acc', displayName: 'P' })
    addPlatformGames(db, account, [
      {
        ref: { externalId: 'g1' },
        title: 'Portal',
        iconUrl: null,
        coverUrl: null,
        lastPlayed: null,
        recentlyPlayed: false,
      },
    ])
    chooseFile.mockResolvedValue('C:\\out\\export.json')

    const result = await exporter().run()

    expect(result).toEqual({ kind: 'saved', path: 'C:\\out\\export.json', games: 1, achievements: 0 })
    const [path, text] = writeFile.mock.calls[0] ?? []
    expect(path).toBe('C:\\out\\export.json')
    const written = JSON.parse(text ?? '') as { format: number; games: { title: string }[] }
    expect(written.format).toBe(1)
    expect(written.games.map((game) => game.title)).toEqual(['Portal'])
  })

  it('answers failed, not an exception, when the file cannot be written', async () => {
    chooseFile.mockResolvedValue('C:\\out\\export.json')
    writeFile.mockRejectedValue(new Error('EACCES'))

    const result = await exporter().run()

    expect(result).toEqual({
      kind: 'failed',
      message: 'Could not save the file. Check that the folder can be written to and try again.',
    })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/main/data-export.test.ts`
Expected: FAIL, "Failed to resolve import ./data-export".

- [ ] **Step 4: Write the exporter**

Create `src/main/data-export.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { AppInfo, ExportResult } from '@shared/ipc'
import { buildDataExport } from './store/export-store'

export interface DataExporterDeps {
  readonly db: DatabaseSync
  readonly appInfo: () => AppInfo
  readonly chooseFile: (defaultName: string) => Promise<string | null>
  readonly writeFile: (path: string, text: string) => Promise<void>
  readonly now?: () => Date
}

const FAILED_MESSAGE =
  'Could not save the file. Check that the folder can be written to and try again.'

export class DataExporter {
  readonly #deps: DataExporterDeps

  constructor(deps: DataExporterDeps) {
    this.#deps = deps
  }

  async run(): Promise<ExportResult> {
    const now = (this.#deps.now ?? (() => new Date()))()
    const path = await this.#deps.chooseFile(`trophy-locker-export-${now.toISOString().slice(0, 10)}.json`)
    if (path === null) return { kind: 'cancelled' }

    const { version, schemaVersion } = this.#deps.appInfo()
    const data = buildDataExport(this.#deps.db, { appVersion: version, schemaVersion, exportedAt: now })
    try {
      await this.#deps.writeFile(path, JSON.stringify(data, null, 2))
    } catch (err) {
      console.error('Saving the data export failed', err)
      return { kind: 'failed', message: FAILED_MESSAGE }
    }
    return {
      kind: 'saved',
      path,
      games: data.games.length,
      achievements: data.games.reduce(
        (total, game) =>
          total + game.entries.reduce((sum, entry) => sum + entry.achievements.length, 0),
        0,
      ),
    }
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/main/data-export.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire the IPC call**

In `src/main/ipc.ts`:
- Add `ExportResult` to the type import from `@shared/ipc`.
- Add to `IpcHandlers`, after `connectRpcs3(...)`: `exportData(): Promise<ExportResult>`
- Add inside `registerIpcHandlers`, after the `IPC.connectRpcs3` handler:

```ts
  ipcMain.handle(IPC.exportData, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.exportData()
  })
```

In `src/preload/index.ts`, after the `connectRpcs3` line:

```ts
  exportData: () => ipcRenderer.invoke(IPC.exportData),
```

In `src/renderer/src/test/fake-api.ts`, after the `connectRpcs3` entry:

```ts
    exportData: vi.fn().mockResolvedValue({ kind: 'cancelled' }),
```

In `src/main/index.ts`:
- Add `import { writeFile } from 'node:fs/promises'` with the other `node:` imports and `import { DataExporter } from './data-export'` with the local imports (keep both in alphabetical position).
- After the `rpcs3Accounts` construction, add:

```ts
  const dataExporter = new DataExporter({
    db,
    appInfo: () => ({ version: app.getVersion(), schemaVersion }),
    chooseFile: async (defaultName) => {
      const options: Electron.SaveDialogOptions = {
        title: 'Export your data',
        defaultPath: join(app.getPath('documents'), defaultName),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }
      const result =
        mainWindow && !mainWindow.isDestroyed()
          ? await dialog.showSaveDialog(mainWindow, options)
          : await dialog.showSaveDialog(options)
      return result.canceled ? null : (result.filePath ?? null)
    },
    writeFile: (path, text) => writeFile(path, text, 'utf8'),
  })
```

- In the handlers object, after `connectRpcs3: (input) => rpcs3Accounts.connect(input),` add:

```ts
    exportData: () => dataExporter.run(),
```

- [ ] **Step 7: Add the IPC tests**

In `src/main/ipc.test.ts`:
- After the `connectRpcs3: vi.fn(...)` fake, add:

```ts
  exportData: vi.fn(() => Promise.resolve({ kind: 'cancelled' as const })),
```

- In the `it.each([...IPC.getAppInfo, ...])` list of channels that reject an untrusted sender, add `IPC.exportData,` after `IPC.connectRpcs3,`.
- Before `describe('library and dashboard handlers'`, add:

```ts
describe('data export handler', () => {
  it('runs the export for our own pages and returns its result', async () => {
    const saved = { kind: 'saved' as const, path: 'C:\\out.json', games: 2, achievements: 9 }
    fakes.exportData.mockResolvedValueOnce(saved)

    await expect(call(IPC.exportData, TRUSTED)).resolves.toEqual(saved)
    expect(fakes.exportData).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 8: Run everything touched**

Run: `npx prettier --write src/main src/preload src/shared src/renderer/src/test && npm run lint && npm run typecheck && npx vitest run src/main`
Expected: all pass. If the `fakes.exportData.mockResolvedValueOnce(saved)` line fails typing because the fake's inferred return type is `{ kind: 'cancelled' }`, give the fake an explicit type: `vi.fn<() => Promise<ExportResult>>(() => Promise.resolve({ kind: 'cancelled' }))` and import `ExportResult`.

- [ ] **Step 9: Commit**

```bash
git add src/main src/preload src/shared src/renderer/src/test
git commit -m "Add the data exporter and its IPC call

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Settings card

**Files:**
- Create: `src/renderer/src/features/settings/DataCard.tsx`
- Test: `src/renderer/src/features/settings/DataCard.test.tsx`
- Modify: `src/renderer/src/features/settings/Settings.tsx`
- Modify: `src/renderer/src/features/settings/Settings.test.tsx`

**Interfaces:**
- Consumes: `window.api.exportData(): Promise<ExportResult>` (Task 2); `plural(count, noun)` from `@/lib/format`; `Button` from `@/components/Button`.
- Produces: `DataCard` (no props).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/features/settings/DataCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportResult } from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { DataCard } from './DataCard'

const exportData = vi.fn<() => Promise<ExportResult>>()

beforeEach(() => {
  window.api = fakeApi({ exportData })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function clickExport() {
  fireEvent.click(screen.getByRole('button', { name: 'Export data…' }))
}

describe('DataCard', () => {
  it('has a titled region and an export button', () => {
    render(<DataCard />)

    expect(screen.getByRole('region', { name: 'Your data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export data…' })).toBeEnabled()
  })

  it('asks for an export once per click', async () => {
    exportData.mockResolvedValue({ kind: 'cancelled' })
    render(<DataCard />)

    clickExport()

    await vi.waitFor(() => expect(exportData).toHaveBeenCalledOnce())
  })

  it('shows where the file went and what was in it', async () => {
    exportData.mockResolvedValue({
      kind: 'saved',
      path: 'C:\\out\\export.json',
      games: 1,
      achievements: 12,
    })
    render(<DataCard />)

    clickExport()

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Saved 1 game and 12 achievements to C:\\out\\export.json')
  })

  it('shows nothing when the save dialog is cancelled', async () => {
    exportData.mockResolvedValue({ kind: 'cancelled' })
    render(<DataCard />)

    clickExport()

    await vi.waitFor(() => expect(exportData).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows why saving failed', async () => {
    exportData.mockResolvedValue({ kind: 'failed', message: 'Could not save the file.' })
    render(<DataCard />)

    clickExport()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the file.')
  })

  it('shows a plain message when the call itself fails', async () => {
    exportData.mockRejectedValue(new Error('boom'))
    render(<DataCard />)

    clickExport()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })

  it('disables the button while saving', async () => {
    let finish: (result: ExportResult) => void = () => {}
    exportData.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<DataCard />)

    clickExport()

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    finish({ kind: 'cancelled' })
    expect(await screen.findByRole('button', { name: 'Export data…' })).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/renderer/src/features/settings/DataCard.test.tsx`
Expected: FAIL, "Failed to resolve import ./DataCard".

- [ ] **Step 3: Write the card**

Create `src/renderer/src/features/settings/DataCard.tsx`:

```tsx
import { useId, useState } from 'react'
import { Button } from '@/components/Button'
import { plural } from '@/lib/format'
import type { ExportResult } from '@shared/ipc'

export function DataCard() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const id = useId()

  async function exportData() {
    setBusy(true)
    setResult(null)
    try {
      setResult(await window.api.exportData())
    } catch {
      setResult({ kind: 'failed', message: 'Something went wrong. Try again.' })
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
          Your data
        </h2>
        <p className="text-sm text-fg-muted">
          Save your games, achievements and unlock history to a JSON file. It holds no passwords,
          keys or platform account ids.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => void exportData()}>
          {busy ? 'Saving…' : 'Export data…'}
        </Button>
      </div>

      {result?.kind === 'saved' && (
        <p role="status" className="text-sm text-fg-muted">
          Saved {plural(result.games, 'game')} and {plural(result.achievements, 'achievement')} to{' '}
          {result.path}
        </p>
      )}
      {result?.kind === 'failed' && (
        <p role="alert" className="text-sm text-danger">
          {result.message}
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/renderer/src/features/settings/DataCard.test.tsx`
Expected: PASS (7 tests). If the status text assertion fails because `plural` returns a different shape, read `src/renderer/src/lib/format.ts`, and change only the expected string in the test to match `plural`'s real output.

- [ ] **Step 5: Add the card to Settings, with a test**

In `src/renderer/src/features/settings/Settings.tsx`: add `import { DataCard } from './DataCard'` after the `ArtworkCard` import, and add `<DataCard />` directly after `<ArtworkCard />` inside the `max-w-3xl` column.

In `src/renderer/src/features/settings/Settings.test.tsx`, add a test inside the existing top-level `describe` that renders `Settings` the way the neighbouring tests do (copy their render call and props) and asserts:

```tsx
    expect(await screen.findByRole('region', { name: 'Your data' })).toBeInTheDocument()
```

- [ ] **Step 6: Run the full checks and commit**

Run: `npx prettier --write src/renderer/src/features/settings && npm run format:check && npm run lint && npm run typecheck && npm test`
Expected: all pass.

```bash
git add src/renderer/src/features/settings
git commit -m "Add the Your data card to Settings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Docs, a real run, and the PR

**Files:**
- Modify: `docs/SPEC.md` (line with `F-34`, and the `exportData(format)` row)
- Modify: `docs/DESIGN.md` (only if it still says export is future work)
- Modify: `docs/ROADMAP.md` (the `Data export, log viewer` item)
- Modify: `docs/PROJECT-MAP.md`
- Modify: `CLAUDE.md` (the test count in **Status**)

- [ ] **Step 1: Update SPEC**

In `docs/SPEC.md`, change `| F-34 | JSON/CSV export | P2 |` to `| F-34 | JSON export (v1; CSV not planned) | P2 |`, and change the `exportData(format)` row to `` | `exportData()` | Save dialog in the main process, one JSON file; resolves `saved`, `cancelled` or `failed` | ``, keeping the row's existing column layout.

- [ ] **Step 2: Update ROADMAP**

Replace `- [ ] Data export, log viewer` with these two lines:

```
- [x] Data export ([design](superpowers/specs/2026-10-02-data-export-design.md)): Settings, "Your data", **Export data…** saves one JSON file (accounts without platform ids, games with each platform entry, achievements and unlocks, platinums, manual links, settings); no credentials, since they never leave the `SecretStore`
- [ ] Log viewer: rolling log files, a level setting and an in-app viewer in Settings (next; needs its own design)
```

- [ ] **Step 2b: Update DESIGN and PROJECT-MAP**

In `docs/DESIGN.md` line 104 (`Data export (JSON) and full local wipe in Settings`), leave it; the wipe is still planned. In `docs/PROJECT-MAP.md`, add rows in the same table style as their neighbours for: `src/shared/data-export.ts` (the `DataExport` shape and `DATA_EXPORT_FORMAT`), `src/main/store/export-store.ts` (`buildDataExport`: four read-only queries joined in memory, omits every platform `external_id`, parses `setting` values as JSON and keeps text that isn't), `src/main/data-export.ts` (`DataExporter.run()`: save dialog, write, `ExportResult`; dialog and write are injected), and `src/renderer/src/features/settings/DataCard.tsx` (the card: busy state, saved path and counts in a `role="status"`, failures in a `role="alert"`, a cancelled dialog shows nothing), each with its test file.

- [ ] **Step 3: Update the test count**

Run `npm test 2>&1 | grep "Tests "`, then replace the `1936 tests` in the **Status** section of `CLAUDE.md` with the new total.

- [ ] **Step 4: Run the app and look at it**

Run (bash): `env -u ELECTRON_RUN_AS_NODE npm run dev`
In the app: Settings, "Your data", **Export data…**, save to the Desktop. Open the file and check:
- `format` is `1` and the counts look right for your library.
- Searching the file for your SteamID, your XUID, and your PSN account id finds nothing.
- Cancelling the dialog shows no message.
Stop the app. If anything is wrong, fix it with a new failing test first.

- [ ] **Step 5: Final checks, commit, push and open the PR**

Run: `npm run format:check && npm run lint && npm run typecheck && npm test`
Expected: all pass.

```bash
git add docs CLAUDE.md
git commit -m "Update docs for data export

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feature/data-export
gh pr create --base main --title "Add data export" --body "<summary, tests added, what you checked by running the app>"
```

The PR body lists the tests added (export-store, data-export, ipc handler, DataCard, Settings) and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
