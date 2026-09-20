---
name: add-emulator-adapter
description: Use when adding a file-based or log-based achievement source such as an emulator (RPCS3, Xenia, etc.) or local tool to Achievement Tracker. Covers format research, defensive parsing, file watching, auto-detection, and tests.
---

# Add an emulator / local-file adapter

For sources that write achievements to disk instead of exposing a web API. If the emulator integrates RetroAchievements, use the `RetroAchievements` provider instead.

## 1. Research the format
- Locate where the emulator stores unlock data (profile/trophy/GPD/INI/JSON/log). Record default paths per OS and how the user can override them.
- Obtain **real sample files** from at least two emulator versions if possible. Sanitize and store under `tests/fixtures/<emulator>/`.
- Document in `docs/PROVIDERS.md`: file paths, structure, how unlock state and timestamps are represented, what identifies the game (title id / NPWR id), where names, descriptions and icons come from.

## 2. Parser (pure, defensive)
- `src/AchievementTracker.Providers/<Emulator>/<Format>Parser.cs`: a static, pure method `ReadOnlySpan<byte>` (or `string`) → parsed record.
- Enforce a maximum file size; validate magic numbers and versions; on anything unexpected throw `ProviderException(ProviderErrorKind.Parse, ...)`. Never let an `IndexOutOfRangeException` or similar escape, and never trust length fields from the file.
- Use `BinaryPrimitives` and `Span<byte>` slicing for binary formats. Add table tests from fixtures plus tests for truncated/corrupt input.

## 3. Provider + watcher
- Implement `IAchievementProvider` with `Capabilities.LocalWatch = true`.
- Override `Watch()`: use `FileSystemWatcher` with a debounce (200-500 ms; emulators often write in bursts, and files may be locked briefly, so retry reads). On change call `onChange(gameRef)`. Don't emit unlock events directly: the diff and baseline rule stay in `AchievementTracker.Sync`.
- Return an `IDisposable` that stops the watcher and unsubscribes events. `ListGamesAsync` / `FetchGameAsync` enumerate what's on disk with the same parser, so a full sync works without the watcher.

## 4. Auto-detect install
- A `Detect` helper checks config files, registry (Windows), and common install paths and returns candidates. The UI lets the user confirm or override the path.

## 5. UI
- Add an "Emulators" connect card under `src/AchievementTracker.App/Views/Accounts/`: detected path, browse button, status (watching / path missing / parse error).

## 6. Finish
- Test: writing a new-unlock fixture into a temp directory produces exactly one change signal and, through the sync engine, one `UnlockEvent`; the initial scan produces none (baseline rule).
- Update README table, PROVIDERS.md, and ROADMAP.
