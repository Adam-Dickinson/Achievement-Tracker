# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A C# / .NET 10 desktop app (Avalonia UI) that tracks achievements/trophies across Steam, Xbox, PlayStation, Epic, Ubisoft, EA and emulators, running in the tray and showing unlock toasts. **Read before making non-trivial changes:**

- [docs/SPEC.md](docs/SPEC.md): requirements, DB schema, provider interface, services
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): projects, data flow, folder structure
- [docs/PROVIDERS.md](docs/PROVIDERS.md): per-platform notes (endpoints there are **unverified**)
- [docs/adr/](docs/adr/): decisions already made (ADR-0002 is current). Don't relitigate without a new ADR.

## Repo layout (short)

- `src/AchievementTracker.Core` domain records + `IAchievementProvider`, `src/...Store` SQLite + migrations, `src/...Providers` one namespace per platform, `src/...Sync` scheduler/diff/backoff, `src/...App` Avalonia shell
- `tests/AchievementTracker.Tests` xUnit tests; `tests/fixtures` sanitized sample data

Dependency rule: `Core` ← `Store`, `Providers` ← `Sync` ← `App`. Providers never touch the DB. Views never call providers.

## Commands

```bash
dotnet build                       # warnings are errors
dotnet test
dotnet format                      # fix style; CI runs `dotnet format --verify-no-changes`
dotnet run --project src/AchievementTracker.App
```

The scaffold exists: `Core` and `Store` (with the migration runner) are real; `Providers` and `Sync` are mostly stubs (only `Backoff` is implemented); the app shows a placeholder main window, a tray icon, and a working click-through toast (tray menu → "Send test notification"). Verified at setup: build, 30 tests, and a manual run. UI targets are in `docs/design/mockups/`; design tokens are in `src/AchievementTracker.App/Themes/Tokens.axaml` and the mockups' design brief in `docs/DESIGN.md` §7.

## Rules

1. **Providers are pure adapters.** They return normalized `Remote*` records. No SQL, no notifications, no UI knowledge.
2. **Baseline rule:** first sync of a game must never emit unlock notifications (SPEC F-16). Preserve this in any sync change.
3. **Secrets only in the credential store** via `ISecretStore`. Never in SQLite, config, logs or view-models. `Secret` is redacted in `ToString()`; keep it that way.
4. **Never inject into or read memory of game processes.** Non-negotiable (anti-cheat safety). The overlay only changes its own window styles.
5. **Unofficial APIs are opt-in and labelled.** Don't add a provider that requires storing a user's password.
6. **Parsers for local files must be defensive:** size limits, throw `ProviderException(Parse)` rather than crash on malformed input, fixture tests.
7. **Fixtures must be sanitized.** No real account IDs, tokens or emails in `tests/fixtures/`. Raw recordings go in `tests/fixtures/_raw/` (gitignored).
8. **SQL lives only in `AchievementTracker.Store`.** Schema changes go through a new migration (see `db-migration` skill), never by editing an applied one.
9. **Verify endpoints and file formats before coding against them.** PROVIDERS.md is prior knowledge, not ground truth. Capture a real response/file and record findings.
10. **Keep dependencies patched.** Warnings are errors, so a vulnerable NuGet package (NU190x) fails the build: upgrade it rather than suppressing.

## Style

- C#: nullable reference types on, file-scoped namespaces, `sealed` by default, records for DTOs, `async`/`await` with `CancellationToken`, no `async void` except UI event handlers, no `.Result`/`.Wait()`
- Naming and formatting are enforced by `.editorconfig` (private fields `_camelCase`); fix analyzer warnings rather than suppressing them, and justify any `#pragma` in a comment
- MVVM: logic in view-models (CommunityToolkit.Mvvm), views contain no logic beyond wiring; compiled bindings (`x:DataType`) everywhere
- Design tokens come from `Themes/Tokens.axaml`; never hard-code colours in views (the toast's 96% background is the one documented exception)
- Match surrounding code; keep methods small; comments explain *why*

## Project skills

Local project skills in `.claude/skills/` (git-ignored, so only present on machines that have them; if missing, follow the same steps using the docs):

| Skill | When |
|---|---|
| `add-provider` | Adding an online platform (API-based) |
| `add-emulator-adapter` | Adding a file-watching emulator/local source |
| `db-migration` | Any schema change |
| `write-adr` | Recording an architectural decision |

## Definition of done

`dotnet build` and `dotnet test` pass with no warnings, `dotnet format --verify-no-changes` is clean, docs updated if behavior/spec changed, UI changes checked by actually running the app, and for provider work: fixtures added and PROVIDERS.md updated with what was actually verified.
