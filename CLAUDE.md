# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Trophy Locker** (formerly Achievement Tracker; the repo folder and GitHub repo keep the old name): an Electron desktop app (TypeScript everywhere, React UI) that tracks achievements/trophies across Steam, Xbox, PlayStation, Epic, Ubisoft and EA (emulators come after v1), running in the tray and showing animated unlock toasts. **Read before making non-trivial changes:**

- [docs/SPEC.md](docs/SPEC.md): requirements, DB schema, provider interface, IPC contract
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code areas, data flow, folder structure
- [docs/PROVIDERS.md](docs/PROVIDERS.md): per-platform notes (endpoints there are **unverified**)
- [docs/adr/](docs/adr/): decisions already made (ADR-0003 is the stack; ADR-0004 is zod for provider replies; ADR-0005 is the library scope, baseline cutoff and tiered polling; ADR-0006 is the v1 provider scope and order; ADR-0007 is refreshing provider credentials; ADR-0008 puts Epic, Ubisoft and EA before PlayStation; ADR-0009 is the Ubisoft sign-in window; ADR-0010 is the EA sign-in window; ADR-0011 is the Steam family library; ADR-0012 is the PlayStation sign-in and its `npsso` cookie). Don't relitigate without a new ADR.

The owner is **new to React**: when writing UI code, favour clear, idiomatic code and explain non-obvious React concepts in your replies.

## Repo layout (short)

- `src/shared` types and contracts used by both sides (domain, provider interface, `ipc.ts`)
- `src/main` Node main process: `store/` (SQLite), `providers/`, `sync/`, plus windows, tray, overlay service, IPC handlers
- `src/preload` builds `window.api` (the only bridge to the UI)
- `src/renderer/src` the React UI (`app/`, `features/*`, `components/`, `overlay/`, `styles/`)

Dependency rule: `shared` ← `main/store`, `main/providers` ← `main/sync` ← `main`. The renderer imports only `shared`, never `main`. Providers never touch the DB; the UI never calls providers.

## Commands

```bash
npm install              # also downloads Electron's binary (postinstall)
npm run dev              # run the app with hot reload
npm test                 # Vitest (Node tests + jsdom component tests)
npm run lint             # zero warnings allowed
npm run typecheck        # main/preload/shared and renderer configs
npm run format           # Prettier on src and config files (CI runs format:check)
npm run build            # typecheck + production build into ./out; run it with `npm start`
```

electron-vite looks for Electron's binary itself and fails with `Error: Electron uninstall` if it is missing. `npm install` fetches it via the `postinstall` script (`install-electron`); if it is ever missing, run `npx install-electron`.

**Launching Electron from a shell that has `ELECTRON_RUN_AS_NODE` set (VS Code's extension host does, so Claude Code's shell has it) makes Electron behave as plain Node** and the app fails with `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`. Unset it first (`env -u ELECTRON_RUN_AS_NODE ...` in bash, `Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell).

Status: the scaffold is real and verified (lint, typecheck, 1079 tests, production build, and a scripted run of the built app). `shared`, `main/store`, `main/sync` and the Steam provider have real code: the sync engine (scheduler with library and game scopes, tiered polling, and the sync pass with the baseline cutoff) starts with the app with Steam registered, and secrets are encrypted with `safeStorage`; the Accounts screen connects a Steam account (checks the key with Steam, stores it, starts syncing) and lists accounts. The Xbox provider is built and verified live (Microsoft sign-in in the browser with a loopback redirect, tokens refreshed by the Scheduler per ADR-0007) and registered, and the Accounts screen connects an Xbox account (an "unofficial" opt-in, then the browser sign-in). Steam unlocks are picked up in near real time: the provider's `watch()` reports a changed stats file and, every 30 s, the game Steam is running, and the Scheduler syncs that game at once (`syncGameNow`). Steam connects with one sign-in (Steam's page in the same kind of window as EA's): the app reads the account's Web API key from Steam and, if the family library is wanted, keeps the refresh token beside it and renews it into 24-hour sessions to add the whole Steam family library (ADR-0011); typing a key stays as a fallback. The Epic provider is built and verified live (a code from Epic's sign-in page in the browser, pasted into the app, then launcher tokens refreshed per ADR-0007) and registered, and the Accounts screen connects an Epic account (the "unofficial" opt-in, a button that opens Epic's sign-in, and a box for the code). The Ubisoft provider is built and verified against a real account (Ubisoft's own sign-in page in a locked-down app window, whose remember-me ticket is traded for Ubisoft Connect launcher sessions and rotated per ADR-0007 and ADR-0009) and registered, and the Accounts screen connects a Ubisoft account (the "unofficial" opt-in, then the sign-in window). The EA provider is built and verified against a real account (EA's own sign-in page in a locked-down app window that may navigate only within `ea.com`, whose `sid`/`remid`/`_nx_mpcid` cookies are traded for 4-hour tokens and rotated per ADR-0007 and ADR-0010) and registered, and the Accounts screen connects an EA account (the "unofficial" opt-in, then the sign-in window). The PlayStation provider is built and verified against a real account (Sony's own sign-in page in a locked-down app window that may navigate only within `sony.com`; the window catches Sony's redirect to the PlayStation App and keeps only the 60-day `npsso` cookie, which mints 10-day refresh tokens per ADR-0012) and registered, and the Accounts screen connects a PlayStation account (the "unofficial" opt-in, then the sign-in window). The emulator providers are still stubs. Unlocks found by the sync engine go through the notification service (`main/notifications.ts`) to the overlay, which stacks up to 3 animated toasts. The UI has a real floating island nav, and the Dashboard, Library, Game detail, Activity and Accounts screens are real, on synced data that refreshes as syncs land; Settings is still a placeholder. UI targets are on the Superdesign canvas (link in `docs/design/README.md`); the HTML snapshots in `docs/design/mockups/` still show the pre-"Afterglow" look until they are re-exported. Design tokens are in `src/renderer/src/styles/index.css`.

## Rules

1. **Providers are pure adapters.** They return normalized `Remote*` objects. No SQL, no notifications, no UI knowledge.
2. **Baseline rule:** a game's first sync must never announce unlocks from before its cutoff, so connecting an account never floods toasts (SPEC F-16, ADR-0005). Preserve this in any sync change.
3. **Secrets only via `SecretStore`.** Never in SQLite, config, logs or the renderer. Keep tokens wrapped in `Secret`, which redacts itself.
4. **Never inject into or read memory of game processes.** Non-negotiable (anti-cheat safety). The overlay only changes its own window.
5. **Unofficial APIs are opt-in and labelled.** Don't add a provider that requires storing a user's password.
6. **Parsers must be defensive:** check JSON replies with a zod schema (ADR-0004); for local files also enforce size limits; throw `ProviderError('parse', ...)` on malformed input; fixture tests.
7. **Fixtures must be sanitized.** No real account IDs, tokens or emails in `tests/fixtures/`. Raw recordings go in `tests/fixtures/_raw/` (gitignored).
8. **SQL lives only in `src/main/store`.** Schema changes are a new `migrations/NNNN_name.sql`, never an edit to an applied one; add an upgrade test.
9. **The renderer is untrusted web content.** Keep `contextIsolation` and `sandbox` on and Node integration off. New capabilities go through `shared/ipc.ts` → `main/ipc.ts` (validate the sender and the payload) → `preload/index.ts`.
10. **Verify endpoints and file formats before coding against them.** PROVIDERS.md is prior knowledge, not ground truth. Capture a real response/file and record findings.
11. **Don't add `"type": "module"` to package.json:** main and preload must build as CommonJS (sandboxed preload scripts can't be ES modules).

## Style

- TypeScript strict (`noUncheckedIndexedAccess` on), no `any`; prefer `interface` for object shapes, string-literal unions over enums, and `Record<Union, ...>` tables so the compiler enforces exhaustiveness
- Prettier formatting (no semicolons, single quotes); ESLint must pass with zero warnings; fix rather than disable rules
- React: function components and hooks; state as local as possible; effects must clean up after themselves; components under `features/<area>/`; shared UI in `components/`
- Styling: Tailwind utility classes using the design tokens (`bg-surface-1`, `text-fg-muted`, `border-rarity-rare`...). **Don't name a colour token `base`, `sm`, `lg`, `xl` etc.** These collide with Tailwind's font-size utilities and silently break text colour. Never hard-code hex colours in components.
- Match surrounding code; keep functions small
- **No code comments** (the owner's choice): explanations go in the docs, mainly `docs/PROJECT-MAP.md`, and in your replies. Only tool directives stay: `/// <reference types=...>`, `// @vitest-environment jsdom`, and an `eslint-disable` if one is ever unavoidable (put the reason in the docs). Applied migration files keep theirs (rule 8)

## Project skills

Local project skills live in `.claude/skills/` (git-ignored, so only present on machines that have them; if missing, follow the same steps using the docs): `add-provider`, `add-emulator-adapter`, `db-migration`, `write-adr`.

## Definition of done

`npm run lint`, `npm run typecheck` and `npm test` pass, `npm run format:check` is clean, docs are updated if behaviour or the spec changed, UI changes were checked by actually running the app, and for provider work: fixtures added and PROVIDERS.md updated with what was actually verified.

## Tests are written by Claude

The owner does not write tests; Claude does, as part of getting a change ready. Before any commit or pull request:

1. Check the change is covered. Add or update tests beside the code (`*.test.ts` / `*.test.tsx`) for new behaviour, changed behaviour and every bug fixed. Test what the code does, not how it is styled: content and accessibility text, props and states, data mapping, edge cases. Pure styling (a token, a class name) needs no test; say so.
2. Run `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm test`, then commit, then open the PR.
3. Say which tests were added or changed in the commit message and the PR description.

Tests describe intended behaviour. If one fails because the owner's code is wrong or unfinished, report it and leave the production code to the owner; never weaken a test to make it pass. If the owner says they've already committed, add the tests in a follow-up commit before the PR.

## When the owner says they've committed

Treat that as a request to sync the docs with the commit. Read the change (`git show`, or `git diff <base>..HEAD`), then update whatever it made stale:

- `docs/ROADMAP.md` (tick or add items), `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/PROVIDERS.md` (only what was actually verified), `docs/PROJECT-MAP.md` (the file map: new, moved or removed files and changed status labels), `README.md`. A new ADR is only for an architectural decision.
- The **Status** paragraph and any counts in this file (tests, providers, and so on).
- Code comments the change made wrong, such as one describing removed behaviour.
- Edit docs and comments only, never behaviour. Leave the edits uncommitted, and list what changed and anything you're unsure about.
