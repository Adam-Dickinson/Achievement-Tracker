# CLAUDE.md

Guidance for Claude Code in this repo.

## What this is

**Trophy Locker** (formerly Achievement Tracker; repo folder and GitHub repo keep old name): Electron desktop app (TypeScript everywhere, React UI) tracking achievements/trophies across Steam, Xbox, PlayStation, Epic, Ubisoft, EA, plus shadPS4 and RPCS3 emulators (ADR-0015; more emulators after v1). Runs in tray, shows animated unlock toasts. **Read before non-trivial changes:**

- [docs/SPEC.md](docs/SPEC.md): requirements, DB schema, provider interface, IPC contract
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code areas, data flow, folder structure
- [docs/PROVIDERS.md](docs/PROVIDERS.md): per-platform notes (endpoints there **unverified**)
- [docs/PROJECT-MAP.md](docs/PROJECT-MAP.md): every folder/file, how they connect, where to work per change
- [docs/adr/](docs/adr/): decisions made. 0003 stack; 0004 zod for provider replies; 0005 library scope, baseline cutoff, tiered polling; 0006 v1 provider scope/order; 0007 refreshing credentials; 0008 Epic/Ubisoft/EA before PlayStation; 0009 Ubisoft sign-in window; 0010 EA sign-in window; 0011 Steam family library; 0012 PlayStation sign-in + `npsso`; 0013 SteamGridDB artwork with user's key; 0014 virtualized lists, Library filtered in UI; 0015 shadPS4 + RPCS3 in v1; 0016 release and updates; 0017 launching installed games. Don't relitigate without new ADR.

Owner is **new to React**: write clear, idiomatic UI code; explain non-obvious React concepts in replies.

## Repo layout

- `src/shared` types/contracts used by both sides (domain, provider interface, `ipc.ts`)
- `src/main` Node main process: `store/` (SQLite), `providers/`, `sync/`, windows, tray, overlay service, IPC handlers
- `src/preload` builds `window.api` (only bridge to UI)
- `src/renderer/src` React UI (`app/`, `features/*`, `components/`, `overlay/`, `styles/`)

Dependency rule: `shared` ← `main/store`, `main/providers` ← `main/sync` ← `main`. Renderer imports only `shared`, never `main`. Providers never touch DB; UI never calls providers.

## Commands

```bash
npm install              # also downloads Electron's binary (postinstall)
npm run dev              # run the app with hot reload
npm test                 # Vitest (Node tests + jsdom component tests)
npm run lint             # zero warnings allowed
npm run typecheck        # main/preload/shared and renderer configs
npm run format           # Prettier on src and config files (CI runs format:check)
npm run build            # typecheck + production build into ./out; run it with `npm start`
npm run dist:dir         # package the unpacked app into ./release/win-unpacked (electron-builder)
npm run dist             # build the NSIS installer into ./release
```

Electron binary missing (`Error: Electron uninstall`): run `npx install-electron`.

**Shell with `ELECTRON_RUN_AS_NODE` set (VS Code extension host, so Claude Code's shell) makes Electron act as plain Node**: app fails with `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`. Unset first (`env -u ELECTRON_RUN_AS_NODE ...` in bash, `Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell).

## Status

Scaffold real and verified (lint, typecheck, 2445 tests plus 4 opt-in large-library tests, production build, scripted run of built app, idle measurement of the packaged app). Built: sync engine (Scheduler, tiered polling, baseline cutoff, `safeStorage` secrets); providers Steam (near-real-time via stats file), Xbox, Epic, Ubisoft, EA, PlayStation, shadPS4, all connectable from Accounts screen; RPCS3 built and connectable (Accounts and onboarding), its earned-trophy state and time format unverified until a trophy is earned in RPCS3, other emulator providers stubs. Also: cross-platform game linking, platinum for every game (F-35), notification service + overlay toasts with live settings, Afterglow UI (nav, Dashboard, Library, Game detail, Activity, Accounts, Settings, onboarding, empty states), SteamGridDB artwork (ADR-0013), redacted rolling logs with a Logs viewer and a Start with Windows switch in Settings, accessibility pass, NSIS installer (per user, unsigned) with a tag-triggered release workflow and notify-only updates (ADR-0016), launch module (`src/main/launch`, ADR-0017: Steam and RPCS3 installs found and games started through the launcher or the emulator, an Emulator program row on Accounts, Play on Game detail, Installed filter in the Library; neither the Steam nor the RPCS3 launch is checked by hand yet; shadPS4 launching deferred), RPCS3 cover art from `ICON0.PNG` via the `trophy-art://` protocol, version 1.0.0 measured against N-01..N-07 (`docs/PERFORMANCE.md`). Fullscreen-game detection not built. Per-feature detail: `docs/PROJECT-MAP.md`, `docs/ROADMAP.md`. Design targets: Superdesign canvas (link in `docs/design/README.md`), snapshots in `docs/design/mockups/`; tokens in `src/renderer/src/styles/index.css`.

## Rules

1. **Providers are pure adapters.** Return normalized `Remote*` objects. No SQL, notifications, or UI knowledge.
2. **Baseline rule:** a game's first sync never announces unlocks from before its cutoff, so connecting an account never floods toasts (SPEC F-16, ADR-0005). Preserve in any sync change.
3. **Secrets only via `SecretStore`.** Never in SQLite, config, logs, renderer. Keep tokens wrapped in `Secret` (self-redacting).
4. **Never inject into or read memory of game processes.** Non-negotiable (anti-cheat safety). Overlay only changes its own window.
5. **Unofficial APIs are opt-in and labelled.** No provider that requires storing a user's password.
6. **Parsers defensive:** check JSON replies with zod (ADR-0004); local files also enforce size limits; throw `ProviderError('parse', ...)` on malformed input; fixture tests.
7. **Fixtures sanitized.** No real account IDs, tokens, emails in `tests/fixtures/`. Raw recordings go in `tests/fixtures/_raw/` (gitignored).
8. **SQL only in `src/main/store`.** Schema change = new `migrations/NNNN_name.sql`, never edit an applied one; add upgrade test.
9. **Renderer is untrusted web content.** Keep `contextIsolation` and `sandbox` on, Node integration off. New capabilities go `shared/ipc.ts` → `main/ipc.ts` (validate sender and payload) → `preload/index.ts`.
10. **Verify endpoints and file formats before coding against them.** PROVIDERS.md is prior knowledge, not ground truth. Capture a real response/file, record findings.
11. **No `"type": "module"` in package.json:** main and preload build as CommonJS (sandboxed preload can't be ES modules).

## Style

- TypeScript strict (`noUncheckedIndexedAccess` on), no `any`; prefer `interface` for object shapes, string-literal unions over enums, `Record<Union, ...>` tables for exhaustiveness
- Prettier (no semicolons, single quotes); ESLint zero warnings; fix rather than disable rules
- React: function components + hooks; state as local as possible; effects clean up; components under `features/<area>/`; shared UI in `components/`
- Styling: Tailwind utilities with design tokens (`bg-surface-1`, `text-fg-muted`, `border-rarity-rare`...). **Never name a colour token `base`, `sm`, `lg`, `xl` etc.**: collides with Tailwind font-size utilities, silently breaks text colour. No hard-coded hex in components.
- Match surrounding code; keep functions small
- **No code comments** (owner's choice): explanations go in docs (mainly `docs/PROJECT-MAP.md`) and replies. Only tool directives stay: `/// <reference types=...>`, `// @vitest-environment jsdom`, unavoidable `eslint-disable` (reason in docs). Applied migration files keep theirs (rule 8)

## Project skills

`.claude/skills/` (git-ignored, machine-local; if missing follow same steps using docs): `add-provider`, `add-emulator-adapter`, `db-migration`, `write-adr`.

## Definition of done

`npm run lint`, `typecheck`, `test` pass; `npm run format:check` clean; docs updated if behaviour/spec changed; UI changes checked by running the app; provider work: fixtures added, PROVIDERS.md updated with what was actually verified.

## Tests are written by Claude

Owner does not write tests; Claude does. Before any commit or PR:

1. Cover the change. Add/update tests beside code (`*.test.ts` / `*.test.tsx`) for new behaviour, changed behaviour, every bug fixed. Test what code does, not styling: content, accessibility text, props/states, data mapping, edge cases. Pure styling (token, class name) needs no test; say so.
2. Run `npm run format:check`, `lint`, `typecheck`, `test`, then commit, then open PR.
3. State tests added/changed in commit message and PR description.

Tests describe intended behaviour. If one fails because owner's code is wrong or unfinished, report it, leave production code to owner; never weaken a test. If owner says already committed, add tests in follow-up commit before PR.

## When the owner says they've committed

Sync docs with the commit. Read change (`git show`, or `git diff <base>..HEAD`), update what it made stale:

- `docs/ROADMAP.md` (tick/add items), `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/PROVIDERS.md` (only actually verified), `docs/PROJECT-MAP.md` (file map: new/moved/removed files, status labels), `README.md`. New ADR only for architectural decisions.
- **Status** section and counts in this file (tests, providers).
- Code comments the change made wrong.
- Docs and comments only, never behaviour. Leave edits uncommitted; list what changed and any doubts.

## graphify

Knowledge graph at graphify-out/ (god nodes, communities, cross-file relationships).

- Codebase questions: first `graphify query "<question>"` when graphify-out/graph.json exists. `graphify path "<A>" "<B>"` for relationships, `graphify explain "<concept>"` for one concept. Scoped subgraph, much smaller than GRAPH_REPORT.md or grep.
- If graphify-out/wiki/index.md exists, use it for broad navigation.
- Read GRAPH_REPORT.md only for broad architecture review or when query/path/explain miss.
- After modifying code, run `graphify update .` (AST-only, no API cost).
