# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A Tauri 2 desktop app (Rust backend, React + TypeScript frontend) that tracks achievements/trophies across Steam, Xbox, PlayStation, Epic, Ubisoft, EA and emulators, running in the tray and showing unlock toasts. **Read before making non-trivial changes:**

- [docs/SPEC.md](docs/SPEC.md): requirements, DB schema, provider trait, IPC contract
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): components, data flow, folder structure
- [docs/PROVIDERS.md](docs/PROVIDERS.md): per-platform notes (endpoints there are **unverified**)
- [docs/adr/](docs/adr/): decisions already made. Don't relitigate without a new ADR.

## Repo layout (short)

- `crates/core` domain types + `AchievementProvider` trait, `crates/store` SQLite, `crates/providers` one module per platform, `crates/sync` scheduler/diff/events
- `src-tauri/` thin Tauri shell (commands, tray, overlay, notify)
- `src/` React UI (`features/*`, `overlay/`, generated `lib/bindings.ts`)

Dependency rule: `core` ← `store`, `providers` ← `sync` ← `src-tauri`. Providers never touch the DB. The UI never calls providers.

## Commands

```bash
pnpm install
pnpm tauri dev                                   # run app
cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm lint && pnpm typecheck && pnpm test
```

The scaffold exists: Rust crates are stubs (only `at-core` has real types; `store`/`providers`/`sync` are placeholders) and the frontend is a shell. The Rust workspace was written without a toolchain available, so run `cargo check --workspace` first and fix anything it finds. UI targets are in `docs/design/mockups/`; design tokens are in `src/styles/index.css` and `.superdesign/design-system.md`.

## Rules

1. **Providers are pure adapters.** They return normalized `Remote*` DTOs. No SQL, no notifications, no UI knowledge.
2. **Baseline rule:** first sync of a game must never emit unlock notifications (SPEC F-16). Preserve this in any sync change.
3. **Secrets only in the OS keychain** via `SecretStore`. Never in SQLite, config, logs or the frontend. Redact tokens in `tracing` output.
4. **Never inject into or read memory of game processes.** Non-negotiable (anti-cheat safety).
5. **Unofficial APIs are opt-in and labelled.** Don't add a provider that requires storing a user's password.
6. **Parsers for local files must be defensive:** size limits, no panics on malformed input, fixture tests.
7. **Fixtures must be sanitized.** No real account IDs, tokens or emails in `tests/fixtures/`. Raw recordings go in `tests/fixtures/_raw/` (gitignored).
8. **SQL lives only in `crates/store`.** Schema changes go through a new migration (see `db-migration` skill), never by editing an applied one.
9. **IPC types come from Rust.** Change the Rust command/struct and regenerate `bindings.ts`; don't hand-edit it.
10. **Verify endpoints and file formats before coding against them.** PROVIDERS.md is prior knowledge, not ground truth. Capture a real response/file and record findings.

## Style

- Rust: `thiserror` for library errors, `anyhow` only in the app shell; `tracing` not `println!`; no `unwrap()` outside tests
- TypeScript: strict mode, no `any`; server state via TanStack Query, UI state via Zustand; components under `features/<area>/`
- Match surrounding code; keep functions small; comments explain *why*

## Project skills

Use these for recurring tasks (in `.claude/skills/`):

| Skill | When |
|---|---|
| `add-provider` | Adding an online platform (API-based) |
| `add-emulator-adapter` | Adding a file-watching emulator/local source |
| `db-migration` | Any schema change |
| `write-adr` | Recording an architectural decision |

## Definition of done

Code + tests pass (`cargo test`, `pnpm test`), clippy/lint clean, docs updated if behavior/spec changed, and for provider work: fixtures added and PROVIDERS.md updated with what was actually verified.
