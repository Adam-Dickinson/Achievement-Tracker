# Data export

Status: approved in chat 2 October 2026. Part 1 of "Data export, log viewer" ([ROADMAP](../../ROADMAP.md)); the log viewer is a separate spec and PR.

## Goal

A user can save everything Trophy Locker knows about their games, achievements and unlocks to one JSON file, from Settings. SPEC F-34 asked for JSON and CSV; DESIGN.md asks for JSON. This ships JSON only.

## Out of scope

- CSV, import, and a full local wipe (a destructive feature that needs its own confirmation design).
- Anything secret. Credentials live in the `SecretStore`, never in SQLite (rule 3), so the export reads SQLite only and cannot leak them. Account `external_id` values (SteamID, XUID, PSN account id, file paths for emulators) are left out too, because they identify the person and the file is meant to be shared or archived.

## The file

One JSON object:

| Field | Content |
| --- | --- |
| `format` | `1`. Bumped on any breaking change to this shape. |
| `exportedAt` | ISO-8601 UTC. |
| `app` | `{ version, schemaVersion }` from `getAppInfo`. |
| `accounts` | `{ id, platform, displayName, status, lastSyncAt, createdAt }` per account. No `external_id`. |
| `games` | One per canonical game: `{ id, title, releaseYear, coverUrl, entries }`. |
| `games[].entries` | One per platform entry: `{ id, accountId, platform, title, iconUrl, coverUrl, portraitUrl, heroUrl, storeUrl, lastPlayed, linked, platinum, achievements }`. No `external_id`, no baseline fields. |
| `entries[].platinum` | `{ earnedAt, detectedAt }` or `null`. |
| `entries[].achievements` | `{ id, name, description, iconUrl, iconLockedUrl, hidden, points, tier, globalPercent, unlock }`. |
| `achievements[].unlock` | `{ unlockedAt, detectedAt, progressCurrent, progressMax }` or `null` when locked. |
| `aliases` | `{ matchKey, gameId }` from `game_alias`, so the user's manual links survive. |
| `settings` | Every row of `setting` as `{ key: parsedJsonValue }`. |

Ids are the local database ids, only so the file is self-consistent (`accountId` refers to `accounts[].id`). They mean nothing outside this install.

## Pieces

1. `src/main/store/export-store.ts`: `exportData(db, meta)` returns the object above. Read-only SQL, in `store/` (rule 8). Reads in four queries (accounts, games and entries, achievements joined to unlocks, aliases and settings) and assembles in memory. A library is in the low thousands of games and tens of thousands of achievements, so one object is fine.
2. `src/main/data-export.ts`: `DataExporter` with `run()`. Asks main for a save path (`dialog.showSaveDialog`, default name `trophy-locker-export-YYYY-MM-DD.json`), builds the object, writes it, and returns `ExportResult`. The dialog and the file write are injected, so it is tested without Electron.
3. `shared/ipc.ts`: `exportData(): Promise<ExportResult>` with `ExportResult = { kind: 'saved'; path: string; games: number; achievements: number } | { kind: 'cancelled' } | { kind: 'failed'; message: string }`. No payload from the renderer, so the page cannot choose where a file is written (rule 9). The handler validates the sender like every other handler. Wired through `main/ipc.ts`, `preload/index.ts`, `main/index.ts` and `fake-api.ts`.
4. `features/settings/DataCard.tsx`: a "Your data" card in Settings: one **Export data…** button, "Saving…" while busy, then the saved path and counts, or the message in a `role="alert"`. A cancelled dialog shows nothing.

## Behaviour and errors

- Cancelling the dialog is not an error.
- A write failure (disk full, no permission) returns `failed` with a plain message; the real error is logged. It never throws across IPC.
- Dates stay as stored (ISO-8601 UTC strings), not reformatted.
- The write is atomic enough for this: write to the chosen path in one call. A half-written file on a crash is acceptable for a user-triggered export.
- Running twice in a row just asks again.

## Tests

- `export-store.test.ts` on a real schema with data added through `sync-store`: accounts, a game with two linked entries, locked and unlocked achievements, a platinum, an alias and settings. Asserts the shape, that unlocks round-trip, that no `external_id` or `account.external_id` appears anywhere in the serialized output, and that an empty database exports empty arrays.
- `data-export.test.ts`: saved (file written, parseable, counts right), cancelled (nothing written), and a failing write returning `failed`.
- `ipc.test.ts`: the handler is registered, rejects an untrusted sender, and returns the exporter's result.
- `DataCard.test.tsx`: calls `exportData` once per click, shows the path and counts, shows nothing on cancel, shows an alert on failure, and disables the button while busy.
- The save dialog and the file in Explorer are checked by running the app.

## Docs

SPEC (F-34 now JSON-only for v1, and the `exportData` IPC row), DESIGN, ROADMAP (tick the export half), PROJECT-MAP, README if it lists features.
