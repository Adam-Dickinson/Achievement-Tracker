# Logging, the log viewer, and a start-with-Windows setting

Status: approved in chat 2 October 2026. Part 2 of "Data export, log viewer" ([ROADMAP](../../ROADMAP.md)), and the first piece of release preparation. The Startup card was added to this spec at the owner's request. Release engineering (installer, updater) is a separate spec.

## Goal

1. The main process writes redacted, rotating log files, so a user can send a useful bug report.
2. Settings shows the recent log in the app, with a level filter and an **Open logs folder** button, and a level setting.
3. Settings has a **Start with Windows** switch, the same control as the tray menu's.

## Out of scope

- Shipping logs anywhere (crash reporting is a later, opt-in item).
- Capturing the renderer's console.
- A search box, export of logs, or live tailing. The viewer is a read-only list with Refresh.
- Launching games (its own post-v1 milestone).

## Logger (`src/main/logging/`)

No new dependency.

- **File:** `<userData>/logs/trophy-locker.log`, one JSON object per line: `{ "time": ISO-8601 UTC, "level": "debug|info|warn|error", "message": string, "data"?: unknown }`.
- **Rotation:** when the current file would pass 1 MB, `trophy-locker.log` becomes `trophy-locker.1.log`, `.1` becomes `.2`, and so on; the file past `.4` is deleted, so at most 5 files (about 5 MB) exist.
- **Level:** `debug < info < warn < error`. Entries below the current level are dropped. Default `info`, saved in the `setting` table under `logging.level` (JSON string). The logger starts at `info` before the database opens, and `setLevel` is called once the saved value is read.
- **Redaction**, applied to the message and to every string inside `data` before anything is written (`redact.ts`):
  - values wrapped in `Secret` (they already render as a redaction marker; arguments are walked so a `Secret` inside an object is caught),
  - `Bearer <token>` and `Authorization` header values,
  - `Cookie` and `Set-Cookie` header values,
  - query and form parameters named like `token`, `access_token`, `refresh_token`, `key`, `apikey`, `code`, `npsso`, `ticket`, `password`, `secret`, `session` (the value is replaced, the name kept),
  - any run of 32 or more characters made only of letters, digits, `-`, `_`, `+`, `/` and `=` (long ids, keys, hashes).
  - Redaction is conservative on purpose: a log line that loses a long id is better than one that leaks a token.
- **Writes** are async, serialised through one queue, and best effort: a failed write is swallowed (written once to the real console), never thrown into the app. `flush()` waits for the queue and is called before quit.
- **Data shapes:** errors are written as `{ name, message, stack }`; objects are walked to a depth of 4 and values over 2,000 characters are cut.

## Capturing what the app already logs

`captureConsole(logger)` wraps the main process's `console.debug/info/log/warn/error` once at startup, before the database opens: each call is formatted (`util.format`-style, errors with stacks), redacted and written, then passed to the original method, so the terminal still shows everything and no existing call site changes. `uncaughtException` and `unhandledRejection` are logged at `error` (the app's existing behaviour for them is unchanged). Tests that spy on `console` keep working because the wrapped method still forwards.

## Reading logs

`readLogs(dir, minLevel, limit)` reads the newest file first, then older ones, until it has `limit` (500) entries at or above `minLevel`, and returns them oldest-first. A line that is not valid JSON (a half-written last line) is skipped. It reads only files named like the logger's own, inside the logs folder.

## IPC (rule 9: sender checked, payloads validated, no paths from the renderer)

| Call | Channel | Payload | Result |
| --- | --- | --- | --- |
| `getLogSettings()` | `logs:get-settings` | none | `{ level }` |
| `setLogLevel(level)` | `logs:set-level` | one of the four level names | `{ level }` |
| `readLogs(minLevel)` | `logs:read` | one of the four level names | `LogEntry[]` (at most 500) |
| `openLogsFolder()` | `logs:open-folder` | none | `void`, opens the folder with `shell.openPath` |
| `getStartupSettings()` | `startup:get` | none | `{ available: boolean, enabled: boolean }` |
| `setStartWithWindows(on)` | `startup:set` | boolean | `{ available, enabled }` |

`available` is false when the app is not packaged (`startWithWindows` returns null), so the switch is disabled in `npm run dev`. The Startup IPC reuses `startWithWindows(app)` from `startup.ts`, the same object behind the tray's toggle, so the two controls always agree.

## Settings screen

- **Logs card:** a level picker, a read-only list (time, level, message, with the data on expand), a minimum-level filter, **Refresh**, and **Open logs folder**. An empty log says so. The list shows the text exactly as written, which is already redacted.
- **Startup card:** one switch, "Start with Windows", described as "Opens Trophy Locker in the tray when you sign in." When unavailable it is disabled with "Available in the installed app."
- Both are new cards in `features/settings/`, built like `ArtworkCard`.

## Behaviour and errors

- A level change applies immediately to new entries.
- If the logs folder cannot be created, logging is off for the session, the viewer shows "Logging is unavailable", and the app carries on.
- Rotation failures never stop logging: if a rename fails the logger keeps appending to the current file.
- `setStartWithWindows` failing returns the real state (`enabled` read back), so the switch cannot lie.

## Tests

- `redact.test.ts`: a table of inputs for each rule above, nested objects and `Secret`, plus a line with nothing to redact staying unchanged.
- `logger.test.ts` (temp folder, injected clock): level filtering, JSON line shape, rotation at the size limit, retention of 5 files, a failing write not throwing, and `flush`.
- `console-capture.test.ts`: each method writes a redacted entry and still forwards, errors keep their stacks, and an object argument is serialised.
- `read-logs.test.ts`: newest-first assembly across files, the limit, the level filter, a half-written last line, and ignoring files that are not the logger's.
- `settings-store.test.ts`: reading and saving the level, with an unknown stored value falling back to `info`.
- IPC: each handler checks the sender and rejects a bad level; `openLogsFolder` takes no payload.
- Startup: get and set through a fake `app`, unpackaged reporting `available: false`, and the read-back after a failed set.
- `LogsCard.test.tsx`, `StartupCard.test.tsx`, and the Settings test.
- The folder opening in Explorer and a real login start are checked by running the installed app.

## Docs

SPEC (the logging line and the IPC table), ROADMAP (tick the log viewer; add the post-v1 "launch installed games" milestone), PROJECT-MAP, CLAUDE.md status counts.
