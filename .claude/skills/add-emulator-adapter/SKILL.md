---
name: add-emulator-adapter
description: Use when adding a file-based or log-based achievement source such as an emulator (RPCS3, Xenia, etc.) or local tool to Achievement Tracker. Covers format research, defensive parsing, file watching, auto-detection, and tests.
---

# Add an emulator / local-file adapter

For sources that write achievements to disk instead of exposing a web API. If the emulator integrates RetroAchievements, use the existing `retroachievements` provider instead.

## 1. Research the format
- Locate where the emulator stores unlock data (profile/trophy/GPD/INI/JSON/log). Record default paths per OS and how the user can override them.
- Obtain **real sample files** from at least two emulator versions if possible. Sanitize and store under `tests/fixtures/<emulator>/`.
- Document in `docs/PROVIDERS.md`: file paths, structure, how unlock state and timestamps are represented, what identifies the game (title id / NPWR id), where names, descriptions and icons come from.

## 2. Parser (pure, defensive)
- `crates/providers/src/<emulator>/<format>.rs`: pure function `bytes -> Result<Parsed, ParseError>`.
- Enforce max file size; validate magic/version; **no panics**, so return `ParseError` on anything unexpected.
- Use `binrw`/`nom` for binary formats. Add table tests from fixtures plus a fuzz/property test on malformed input.

## 3. Provider + watcher
- Implement `AchievementProvider` with `capabilities.local_watch = true`.
- `watch()` uses `notify` with a debouncer (200-500 ms; emulators often write in bursts). On change: re-read → parse → emit through the normal sync diff path. Don't emit unlock events directly. The diff and baseline rule stay in `crates/sync`.
- `list_games` / `fetch_game` enumerate what's on disk (same parser) so a full sync works without the watcher.

## 4. Auto-detect install
- `detect.rs`: check config files, registry (Windows), and common install paths. Return candidates. The UI lets the user confirm or override the path.

## 5. UI
- Add an "Emulators" connect card under `src/features/accounts/`: detected path, browse button, status (watching / path missing / parse error).

## 6. Finish
- Test: writing a new-unlock fixture into a temp dir produces exactly one `UnlockEvent`; initial scan produces none (baseline rule).
- Update README table, PROVIDERS.md, and ROADMAP.
