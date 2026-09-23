# Project Map: where everything is

A guide to finding your way around the repo: what each folder and file is for, how the pieces connect, and where to work for each kind of change.

- New to the codebase? Read sections 1 to 3, then follow the walkthrough in section 5.
- Know what you want to change? Jump to the lookup table in section 2, or the recipes in section 11.
- New to React or Electron? [SCAFFOLD-GUIDE.md](SCAFFOLD-GUIDE.md) is the primer; this document is the map.

**Status labels used below.** **Real**: implemented and tested. **Placeholder**: works but is temporary. **Stub**: an empty file that marks where code will go. **Planned**: does not exist yet.

**Keep this document current.** It is listed in the "when the owner says they've committed" rule in [CLAUDE.md](../CLAUDE.md), so it gets synced after commits. Paths change more often than concepts, so it names files and folders, not line numbers.

---

## 1. The 60-second picture

Electron apps run as several separate programs. This one has three kinds of code, and knowing which kind a file belongs to tells you what it may do.

```
 src/main  ("main process": Node.js)         src/renderer  ("renderer": a web page)
 ┌──────────────────────────────────┐        ┌────────────────────────────────────┐
 │ owns the OS: windows, tray, DB,  │        │ React UI. Draws pixels. Untrusted: │
 │ files, network, providers, sync  │        │ no Node.js, no file access.        │
 └───────────────▲──────────────────┘        └───────────────▲────────────────────┘
                 │  IPC (messages)                            │  window.api
                 │                                            │
                 └────────────►  src/preload  ◄───────────────┘
                              (the one small, safe bridge)

                     src/shared: types and tiny helpers imported by all three
```

- **Main process** (`src/main`): a Node.js program. It creates the windows, the tray icon and the database, and runs the sync engine (which will talk to the platforms once their providers exist). It can do anything on the machine.
- **Renderer** (`src/renderer`): each window is a small web page running React. It is treated as untrusted web content, so it cannot touch the machine directly.
- **Preload** (`src/preload`): a tiny script that runs before each page loads and hands the page one object, `window.api`. Everything the UI can ask the main process to do is on that object.
- **Shared** (`src/shared`): plain TypeScript both sides import: the domain types, the provider interface, the IPC contract. It must not use Node or browser APIs.

**Two windows** are created by [windows.ts](../src/main/windows.ts):

| Window | HTML entry | React root | What it is |
|---|---|---|---|
| Main window | [index.html](../src/renderer/index.html) | [main.tsx](../src/renderer/src/main.tsx) then `app/App.tsx` | The normal app window. Closing it destroys it; the tray recreates it. |
| Overlay | [overlay.html](../src/renderer/overlay.html) | [overlay/main.tsx](../src/renderer/src/overlay/main.tsx) then `overlay/OverlayApp.tsx` | A transparent, click-through, always-on-top window that only shows toasts. Created hidden at startup. |

**The dependency rule** (also in [CLAUDE.md](../CLAUDE.md) and [ARCHITECTURE.md](ARCHITECTURE.md) §2):

```
shared  ←  main/store, main/providers  ←  main/sync  ←  main
```

The renderer imports only `shared`, never `main`. Providers never touch the database. The UI never calls providers. Every request from the UI to the main process goes through the IPC contract in `shared/ipc.ts`.

---

## 2. "I want to..." lookup

| I want to... | Go to | Also touch / read |
|---|---|---|
| Change how the toast looks | [overlay/Toast.tsx](../src/renderer/src/overlay/Toast.tsx) | Colours, shadows and radii come from [styles/index.css](../src/renderer/src/styles/index.css). The test is `Toast.test.tsx` next to it. |
| Change the toast's corner or margin | [main/overlay-service.ts](../src/main/overlay-service.ts) | `SCREEN_MARGIN` and `EXIT_ANIMATION_MS` are constants there. |
| Change how long toasts stay, how many stack, or when a burst collapses | [main/notifications.ts](../src/main/notifications.ts) | `TOAST_DURATION_MS`, `MAX_VISIBLE` (also change `OVERLAY_SIZE`) and `BURST_SIZE`. |
| Change the overlay window's size | [main/windows.ts](../src/main/windows.ts) (`OVERLAY_SIZE`) | **Must match** the padding in `overlay/OverlayApp.tsx` and the toast's size, or shadows get clipped. |
| Change the sample toasts behind "Send test notification" | [main/sample-toasts.ts](../src/main/sample-toasts.ts) | They cycle ultra-rare, rare, uncommon, common. |
| Change what counts as Rare, Ultra Rare and so on | [shared/rarity.ts](../src/shared/rarity.ts) | The `[data-rarity]` rules in `styles/index.css` (every rarity needs one; a test checks) and the `--color-rarity-*` tokens; DESIGN.md §6. Recipe G. |
| Add or change a colour, font, radius or shadow | [styles/index.css](../src/renderer/src/styles/index.css) (`@theme`) | [DESIGN.md](DESIGN.md) §7. See section 8 for the gotchas. |
| Change the main window (size, background, security) | [main/windows.ts](../src/main/windows.ts) (`createMainWindow`, `webPreferences`) | Keep `contextIsolation` and `sandbox` on. |
| Change the tray menu | [main/tray-menu.ts](../src/main/tray-menu.ts) | The actions it calls are wired in `main/index.ts`; the icon is created in `tray.ts`. |
| Change startup, single-instance or close-to-tray behaviour | [main/index.ts](../src/main/index.ts) | |
| Add a screen | A folder under [renderer/src/features/](../src/renderer/src/features/) | Wire it into `app/App.tsx`; add a nav entry in `app/navigation.ts`. |
| Change the navigation (the island bar) | [app/IslandNav.tsx](../src/renderer/src/app/IslandNav.tsx), [app/navigation.ts](../src/renderer/src/app/navigation.ts) | |
| Add a reusable UI piece (button, gem, card) | [renderer/src/components/](../src/renderer/src/components/) | |
| Let the UI ask the main process for something | Section 11, recipe A | `shared/ipc.ts`, `main/ipc.ts`, `preload/index.ts`, `main/index.ts` |
| Change the database schema | A **new** file in [main/store/migrations/](../src/main/store/migrations/) | Never edit `0001_init.sql`. Project skill: `db-migration`. |
| Write any SQL | Only under [src/main/store/](../src/main/store/) | Rule 8 in CLAUDE.md. |
| Add a platform (Steam, Xbox, ...) | [main/providers/&lt;name&gt;/](../src/main/providers/) | [shared/platform.ts](../src/shared/platform.ts), [PROVIDERS.md](PROVIDERS.md). Skill: `add-provider`. |
| Add an emulator or file-based source | [main/providers/](../src/main/providers/) | Skill: `add-emulator-adapter`. |
| Work on sync (polling, diffing, backoff) | [src/main/sync/](../src/main/sync/) | [SPEC.md](SPEC.md) §5. First-sync rule: no toasts on the first sync of a game. |
| Store a token or API key | [shared/secret.ts](../src/shared/secret.ts), [shared/secret-store.ts](../src/shared/secret-store.ts) | Never in SQLite, config or logs. In the app, secrets go through [main/safe-storage-secret-store.ts](../src/main/safe-storage-secret-store.ts). |
| Change domain types (games, achievements, unlocks) | [shared/models.ts](../src/shared/models.ts) | |
| Change the provider interface | [shared/provider.ts](../src/shared/provider.ts) | [SPEC.md](SPEC.md) §4. Every provider is affected. |
| Add an error kind | [shared/errors.ts](../src/shared/errors.ts) | |
| Change the build, path aliases or the production CSP | [electron.vite.config.ts](../electron.vite.config.ts) | |
| Change lint rules | [eslint.config.mjs](../eslint.config.mjs) | |
| Change formatting | [.prettierrc.json](../.prettierrc.json) | |
| Change CI | [.github/workflows/ci.yml](../.github/workflows/ci.yml) | |
| Change the app icon | [resources/](../resources/) (`icon.png`, `icon.ico`, `icon.svg`) | `windows.ts` and `tray.ts` import `icon.png`. |
| Record an architectural decision | A new file in [docs/adr/](adr/) | Skill: `write-adr`. |
| See what to build next | [ROADMAP.md](ROADMAP.md) | |
| See what a screen should look like | The Superdesign canvas (link in [design/README.md](design/README.md)) | The HTML in `docs/design/mockups/` is out of date. |

---

## 3. Top-level files and folders

```
Achievement-Tracker/
├── src/                     the app's code (section 4)
├── tests/                   shared test data (fixtures only, for now)
├── docs/                    all documentation (section 9)
├── resources/               app icon
├── .github/workflows/       CI
├── out/                     build output (git-ignored)
├── node_modules/            installed packages (git-ignored)
├── .claude/                 local Claude Code project skills (git-ignored)
├── .superdesign/            local design tooling (git-ignored)
├── .vscode/                 your editor settings (git-ignored)
└── config files             see below
```

| File | What it does | When you touch it |
|---|---|---|
| [package.json](../package.json) | Name, version, licence, `npm` scripts, dependencies. `"main"` points at the built main process (`out/main/index.js`). | Adding a package or script. **Never add `"type": "module"`** (main and preload must build as CommonJS). |
| `package-lock.json` | Exact installed versions. CI uses it via `npm ci`. | Only by running npm. |
| [electron.vite.config.ts](../electron.vite.config.ts) | Build config for all three parts: main, preload, renderer. Defines the `@shared` and `@` aliases, the two HTML entries (`index`, `overlay`), the React and Tailwind plugins, and a Content-Security-Policy that is injected only in production builds. Marks `node:sqlite` as external for main. | Adding an entry page, an alias, or changing the CSP. |
| [vitest.config.ts](../vitest.config.ts) | Test runner config: aliases, and which files count as tests (`src/**/*.test.ts` and `.tsx`). Runs in Node by default. | Rarely. |
| [tsconfig.json](../tsconfig.json) | Just points at the two below. | Never. |
| [tsconfig.node.json](../tsconfig.node.json) | Type-checks `src/main`, `src/preload`, `src/shared` and the two config files, with Node types. | Adding a path alias. |
| [tsconfig.web.json](../tsconfig.web.json) | Type-checks `src/renderer/src` and `src/shared` with browser types and JSX. Excludes `src/shared/**/*.test.ts`. | Adding a path alias. |
| [eslint.config.mjs](../eslint.config.mjs) | Lint rules. Node globals for main/preload/shared, browser globals plus React-hooks rules for the renderer. Ignores build output, mockups, `resources` and `.superdesign`. | Changing rules (fix warnings rather than disabling them). |
| [.prettierrc.json](../.prettierrc.json) | Formatting: 100 columns, no semicolons, single quotes, trailing commas. | Rarely. |
| `.prettierignore` | What the formatter skips. | Rarely. |
| `.editorconfig` | Editor basics: UTF-8, LF, 2-space indent. | Rarely. |
| `.gitattributes` | Forces LF line endings and marks images and fonts as binary. | Never. |
| `.gitignore` | Keeps out `node_modules`, `out`, databases, secrets, `tests/fixtures/_raw/`, `.claude`, `.vscode`, `.superdesign`. | Adding a new kind of local-only file. |
| [CLAUDE.md](../CLAUDE.md) | Rules and commands for Claude Code in this repo. | When a project rule changes. |
| [README.md](../README.md) | Public overview, links to the docs, how to run. | When setup or scope changes. |
| `LICENSE` | GPL-3.0 text. | Never. |

**Path aliases.** Two shortcuts are used in imports:

- `@shared/...` means `src/shared/...` (main, preload and renderer).
- `@/...` means `src/renderer/src/...` (renderer only).

An alias has to be declared in **three** places, or something breaks: `electron.vite.config.ts` (the bundler), the `paths` in `tsconfig.node.json` and `tsconfig.web.json` (the type-checker), and `vitest.config.ts` (tests).

---

## 4. `src/`: the code, folder by folder

### 4.1 `src/shared/`: types and contracts (Real)

Runs in both worlds, so it may not import from `main` or `renderer`, and may not use Node or browser APIs.

| File | What it holds |
|---|---|
| [index.ts](../src/shared/index.ts) | Re-exports everything below. Code in this repo imports the specific file instead (for example `@shared/ipc`). |
| [platform.ts](../src/shared/platform.ts) | `PLATFORMS`: every source achievements can come from (steam, xbox, playstation, epic, ubisoft, ea, retroachievements, rpcs3, xenia, local_file). `PLATFORM_INFO` gives each a display name and an `unofficial` flag. **These ids are stored in the database, so never rename one.** `PLATFORM_INFO` is a `Record<Platform, ...>`, so adding a platform is a compile error until it is described. |
| [rarity.ts](../src/shared/rarity.ts) | The `Rarity` type (`common`, `uncommon`, `rare`, `ultra_rare`), `rarityFromPercent()` (under 2% ultra rare, under 10% rare, up to 30% uncommon, else common), and `RARITY_LABEL`. |
| [models.ts](../src/shared/models.ts) | The normalized shapes providers return: `RemoteGame`, `RemoteAchievement`, `RemoteUnlock`, `RemoteGameAchievements`, plus `AccountCredentials`, `AccountInfo` and `UnlockEvent`. Note `RemoteGame` has `iconUrl` only; the Library screens will need a cover URL added. |
| [provider.ts](../src/shared/provider.ts) | The `AchievementProvider` interface every platform adapter implements (`authenticate`, `validate`, `listGames`, `fetchGame`, optional `watch`), `ProviderCapabilities` and `AuthInput`. |
| [errors.ts](../src/shared/errors.ts) | `ProviderError` with a `kind` (`auth_expired`, `rate_limited`, `network`, `parse`, `unsupported`, `other`), an optional retry delay, and `isRetryable`. |
| [secret.ts](../src/shared/secret.ts) | `Secret`: wraps a token so printing or serializing it shows `Secret(<redacted>)`. The only way to read it is `expose()`. |
| [secret-store.ts](../src/shared/secret-store.ts) | The `SecretStore` interface and an in-memory implementation used by tests. The production version is `main/safe-storage-secret-store.ts`. |
| [ipc.ts](../src/shared/ipc.ts) | **The IPC contract.** Channel names (`IPC`), payload types (`AppInfo`, `ToastPayload`, `AccountSummary`, `SteamConnectInput`, `ConnectResult`), and `AchievementTrackerApi`, the exact shape of `window.api`. This is the first place to look when the UI and main process need to talk. |
| [dashboard.ts](../src/shared/dashboard.ts) | `DashboardStats` (the Dashboard's numbers, "Nearly there" and recent unlocks) and `completionPercent()`, a floor-not-round percentage. |
| [library.ts](../src/shared/library.ts) | What the Library, Game detail and Dashboard screens receive: `LibraryGame`, `GameAchievement`, `GameDetail`, `RecentUnlock`. |

Tests sit beside the code: `errors.test.ts`, `platform.test.ts`, `rarity.test.ts`, `secret.test.ts`, `dashboard.test.ts`.

### 4.2 `src/main/`: the main process (Node.js)

Top-level files (Real unless noted):

| File | What it does |
|---|---|
| [index.ts](../src/main/index.ts) | **The entry point and wiring.** Takes the single-instance lock (a second launch just shows the first window); creates the main window on demand; keeps the app alive with no windows open (the tray keeps it reachable); hardens every window (no popups, no navigation away); opens the database; starts the sync `Scheduler` with the Steam provider and the `SafeStorageSecretStore` (it idles until an account is connected) and stops it on quit; creates the overlay and the tray; registers IPC handlers. Services are plain modules wired together here by hand. There is no DI container ([ARCHITECTURE.md](ARCHITECTURE.md) §2). |
| [windows.ts](../src/main/windows.ts) | Creates both windows. Holds the shared security settings (`contextIsolation` on, `nodeIntegration` off, `sandbox` on, preload script). `createMainWindow()`: 1440x900, minimum 1024x680, shown once ready to avoid a white flash. `createOverlayWindow()`: transparent, frameless, always on top, click-through, unable to take focus. Also exports `OVERLAY_SIZE`. Loads the dev server URL in development and the built file in production. |
| [safe-storage-secret-store.ts](../src/main/safe-storage-secret-store.ts) | `SafeStorageSecretStore`, the production `SecretStore`. Encrypts each secret with Electron `safeStorage` (Windows DPAPI) and keeps it as base64 in `secrets.json` in the app's data folder, keyed by account id. Refuses to save without OS encryption; a secret it can't decrypt reads as missing; a damaged file throws rather than being overwritten; writes go to a temporary file first, then a rename. `safeStorage` is passed in, so `safe-storage-secret-store.test.ts` uses a fake. |
| [coalesce.ts](../src/main/coalesce.ts) | `coalesce(fn, ms)`: a burst of calls runs `fn` once. Used so a first sync of every game refreshes the UI at most once a second. |
| [notifications.ts](../src/main/notifications.ts) | `NotificationService`: turns `UnlockEvent`s into toasts (`unlockToast`, `burstToast`), keeps at most 3 on screen for 5 s each and queues the rest, drops duplicates, and collapses more than 5 at once into one toast. While `paused` (the tray's "Pause notifications"), unlocks are not shown; the test notification still is. Hands the on-screen list to a `display` callback. Tested with fake timers in `notifications.test.ts`. |
| [overlay-service.ts](../src/main/overlay-service.ts) | `OverlayService.display(toasts)`: waits for the overlay page to load, then either positions and shows the window without stealing focus, or (for an empty list) hides it after the exit animation, and sends the list over IPC. |
| [tray.ts](../src/main/tray.ts) | Creates the tray icon with the menu from `tray-menu.ts`. Clicking the icon opens the window. It is a native Electron menu, so it has no React and no visual design. |
| [tray-menu.ts](../src/main/tray-menu.ts) | `trayMenuTemplate(actions)`: Open Achievement Tracker, Send test notification, Pause notifications (checkbox), Start with Windows (checkbox, greyed out in development), Quit. Kept apart from `tray.ts` so it can be tested without Electron. |
| [startup.ts](../src/main/startup.ts) | "Start with Windows": `startWithWindows(app)` registers the installed app to start at login with `--hidden` (null in development), and `launchedHidden(argv)` makes such a start stay in the tray. |
| [ipc.ts](../src/main/ipc.ts) | `registerIpcHandlers()`: one `ipcMain.handle` per channel. Each first checks the sender is one of our own pages (`isTrustedSender`); `connectSteam` then checks its payload with a zod schema (answering `invalid_input` if it fails) before calling the handler passed in from `index.ts`. `ipc.test.ts` replaces `electron` with a stand-in to test both checks. |
| [accounts.ts](../src/main/accounts.ts) | `connectSteam()`: `authenticate` and `validate` with Steam, `upsertAccount`, save the key in the `SecretStore` under the account's id, `Scheduler.startAccount`. Turns failures into a `ConnectResult` (a rejected key, a connection problem, or the provider's own message) and never throws. Tested in `accounts.test.ts` with a fake provider. |
| [sample-toasts.ts](../src/main/sample-toasts.ts) | Four sample unlocks, one per rarity, cycled by `nextSampleToast()`. Only used by "Send test notification", which queues them like real unlocks. |
| [env.d.ts](../src/main/env.d.ts) | Type declarations for Vite and electron-vite features such as `import.meta.glob` and the `?asset` import suffix. |

`?asset`: `windows.ts` and `tray.ts` import the icon as `icon.png?asset`. That is an electron-vite feature that gives you a file path which still works after the app is built.

**`store/`: the database (Real)**

| File | What it does |
|---|---|
| [database.ts](../src/main/store/database.ts) | `openDatabase(path)`: opens SQLite through Node's built-in `node:sqlite`, turns on WAL mode and foreign keys, runs pending migrations and returns the handle and schema version. `index.ts` passes the handle to the sync `Scheduler`. |
| [migrations.ts](../src/main/store/migrations.ts) | Loads every `migrations/NNNN_name.sql` file as text at build time, checks the filename, and sorts by version. |
| [migrate.ts](../src/main/store/migrate.ts) | `applyMigrations()`: applies each migration newer than the database's version, each in its own transaction, tracking progress in SQLite's `user_version`. A failing migration rolls back and stops. |
| [migrations/0001_init.sql](../src/main/store/migrations/0001_init.sql) | The schema: `account`, `game` (canonical, cross-platform), `platform_game` (a game on one account/platform, with `baseline_done` for the first-sync rule), `achievement`, `unlock` (with `notified`), `sync_state`, `setting`, plus two indexes. **Never edit a migration that has shipped**: add a new numbered file. |
| [migrations/0002_baseline_cutoff.sql](../src/main/store/migrations/0002_baseline_cutoff.sql) | Adds `platform_game.baseline_cutoff`: a game's first sync announces only unlocks dated after it (`NULL` = fully silent). See ADR-0005. |
| [migrate.test.ts](../src/main/store/migrate.test.ts) | Tests numbering, creating the schema, running twice, and rollback. New migrations need an upgrade test here (rule 8). |
| [sync-store.ts](../src/main/store/sync-store.ts) | The sync engine's SQL, one small function per query: read an account or a platform game, list connected accounts and an account's games, upsert achievements, insert unlocks and report which were genuinely new (`INSERT OR IGNORE`), set `baseline_done`, read and write `sync_state`, set an account's status, create or reconnect an account (`upsertAccount`: same platform and id keeps the same row, so its key and games stay attached), and add games found by `listGames` (`addPlatformGames`: new games get a `game` + `platform_game` row awaiting their silent first sync; known ones are updated without resetting the baseline or blanking the last-played time; nothing is ever deleted). Row types `AccountRow`, `PlatformGameRow`, `SyncStateRow`. |
| [library-store.ts](../src/main/store/library-store.ts) | Read-only SQL for the screens: `listLibraryGames` (each game with its cover and unlocked/total), `getGameDetail`, `listRecentUnlocks` and `getDashboardStats`. Tested in `library-store.test.ts` on a real schema, with data added through `sync-store`. |
| [sync-store.test.ts](../src/main/store/sync-store.test.ts) | Each query against a real migrated in-memory database, plus the baseline rule end to end. |

The database file is `achievement-tracker.db` inside Electron's per-user data folder (`app.getPath('userData')`, normally under `%APPDATA%` on Windows).

**`sync/`: keeping data fresh (Real, game scope; idle until an account is connected)**

The design and the as-built behaviour (outcomes table, what is not built yet) are in [SPEC.md](SPEC.md) §5.

- [sync-pass.ts](../src/main/sync/sync-pass.ts): `runSyncPass()`, **what** one sync of one game does. Fetches from the provider, then in one transaction upserts achievements, inserts unlocks and applies the baseline rule (the first sync of a game records everything but returns no events). Returns the `UnlockEvent`s only after the commit.
- [scheduler.ts](../src/main/sync/scheduler.ts): the `Scheduler`, **when** syncs happen. One loop per connected account; each round first reads the library (`syncLibrary`: `listGames`, then `addPlatformGames` with the baseline cutoff), then syncs the games that are due (`syncDueGames`), with recently played games every 5 minutes and the rest every 6 hours. `startAccount(id)` syncs a newly connected account straight away, never running two rounds of one account at once. `onDataChanged` fires when a library look adds games, a game syncs or a login expires; `main/index.ts` forwards it to the main window as `data:changed`, at most once a second (`coalesce.ts`). Outcomes go in `sync_state` (backoff on network trouble, `needs_reauth` on an expired login). `stop()` cancels timers and in-flight calls. New unlocks go to its `onUnlocks` callback.
- [backoff.ts](../src/main/sync/backoff.ts): `backoffDelayMs()` gives exponential retry delays, and `withJitter()` adds up to 20% at random.
- Tests beside each: `sync-pass.test.ts` and `scheduler.test.ts` use a fake provider and a fake clock; `backoff.test.ts`.
- Planned: finding new games (library scope, with the Accounts flow) and a running-game detector (M2).

**`providers/`: one folder per platform (Steam Real, the rest Stubs)**

- `steam/` (Real, verified live; notes and captured replies in [PROVIDERS.md](PROVIDERS.md)):
  - [index.ts](../src/main/providers/steam/index.ts): `SteamProvider`. `authenticate` checks the key and SteamID64 format, then confirms them with Steam; `validate` returns the display name; `listGames` returns the owned games with achievements plus recently played games you don't own (Steam Families); `fetchGame` makes three requests at once (schema, the player's unlocks, rarity) and merges them. Registered in `src/main/index.ts`.
  - [api.ts](../src/main/providers/steam/api.ts): `steamGet()`, the only code that calls Steam. Turns HTTP failures into `ProviderError` kinds (HTML 401/403 = `auth_expired`, 429 = `rate_limited`, 5xx and connection failures = `network`) and hands any JSON body, even on a 400/403, to the parsers. Never puts the URL (which holds the key) in an error.
  - [parse.ts](../src/main/providers/steam/parse.ts): zod schemas for each reply (ADR-0004) and the mapping to `Remote*` types.
  - Tests beside each, using the fixtures in `tests/fixtures/steam/` and a stubbed `fetch`.
- `xbox/`, `playstation/`, `retroachievements/`, `rpcs3/`, `xenia/`, `epic/`, `ubisoft/`, `ea/`, `local-file/`: Stubs. Each contains an `index.ts` with a comment describing the plan and `export {}`. Next are RetroAchievements, RPCS3 and Xbox (M2). Providers are pure adapters: they return `Remote*` objects and never touch SQL, notifications or the UI. Notes on each platform are in [PROVIDERS.md](PROVIDERS.md); endpoints there are unverified until you capture a real response.

### 4.3 `src/preload/`: the bridge (Real)

[index.ts](../src/preload/index.ts) builds the `window.api` object and exposes it with `contextBridge.exposeInMainWorld`. Its entries today: `getAppInfo`, `sendTestNotification`, `listAccounts` and `connectSteam` (all `ipcRenderer.invoke`), and two subscriptions that each return an "unsubscribe" function: `onToasts` (the list of toasts on screen) and `onDataChanged`. Also `listLibrary`, `getGame` and `getDashboard`. The UI never receives `ipcRenderer` itself. Its type is `AchievementTrackerApi` from `shared/ipc.ts`, so the compiler tells you if the two drift apart.

### 4.4 `src/renderer/`: the UI

**HTML entry pages** (one per window): [index.html](../src/renderer/index.html) loads `src/main.tsx`; [overlay.html](../src/renderer/overlay.html) loads `src/overlay/main.tsx` and forces a transparent background, because the overlay window must not paint anything except the toast.

**`src/renderer/src/`**

| Path | What it is |
|---|---|
| [main.tsx](../src/renderer/src/main.tsx) | Entry for the main window: mounts `<App />` into `#root` and imports the global CSS. |
| [env.d.ts](../src/renderer/src/env.d.ts) | Tells TypeScript that `window.api` exists and what type it has. |
| `app/` (main window shell, Real) | |
| &nbsp;&nbsp;[App.tsx](../src/renderer/src/app/App.tsx) | The shell. Holds which page is selected and which game is open (`useState`), and the app info fetched from the main process (`useEffect`). Shows the island nav, then either the page (`PageContent`, a `switch` on the page id: Dashboard, Library and Accounts are real; the rest show placeholder text) or, when a game is open, `GameDetail` (keyed by the game id). Picking a page in the nav closes the game. **There is no router**: pages are just values in state. |
| &nbsp;&nbsp;[IslandNav.tsx](../src/renderer/src/app/IslandNav.tsx) | The floating "island" bar at the top of the window: brand, one button per page (the current page is a lime pill) and the app version. It only shows what it is given (`selected`, `onSelect`, `info`); `App` owns the state. |
| &nbsp;&nbsp;[navigation.ts](../src/renderer/src/app/navigation.ts) | `PageId` and `NAV_ITEMS`: Dashboard, Library, Activity, Accounts, Settings, each with a label, description and icon. |
| &nbsp;&nbsp;[App.test.tsx](../src/renderer/src/app/App.test.tsx) | Tests page switching, opening a game from the Library and leaving it, and the test-notification button, with `fakeApi()`. |
| &nbsp;&nbsp;[IslandNav.test.tsx](../src/renderer/src/app/IslandNav.test.tsx) | Tests the "Main" navigation landmark, the current page, click reporting and the version text. |
| `overlay/` (the toast window, Real) | |
| &nbsp;&nbsp;[OverlayApp.tsx](../src/renderer/src/overlay/OverlayApp.tsx) | Root of the overlay page. Subscribes via `window.api.onToasts` and draws the list it is given, stacked with the newest at the bottom; it has no timers of its own. Its padding and gap decide how much room the toasts' shadows have. |
| &nbsp;&nbsp;[Toast.tsx](../src/renderer/src/overlay/Toast.tsx) | The unlock toast component: gradient icon tile, a `RarityGem` heading, display-font title and percentage, a `RarityChip`, a spring-in and slide-out with Motion, a gold glint on ultra rare, and reduced-motion support. The card sits in its rarity colour scope (`data-rarity`), so it has no per-rarity class table. |
| &nbsp;&nbsp;[main.tsx](../src/renderer/src/overlay/main.tsx) | Entry for the overlay window. |
| &nbsp;&nbsp;`OverlayApp.test.tsx`, `Toast.test.tsx` | Component tests. |
| `components/` (shared UI, Real) | |
| &nbsp;&nbsp;[Button.tsx](../src/renderer/src/components/Button.tsx) | Primary and secondary button; extra props pass through. |
| &nbsp;&nbsp;[RarityChip.tsx](../src/renderer/src/components/RarityChip.tsx) | A small pill with the rarity's gem and name. Ultra rare gets a gradient fill and a glow. Uses the rarity scope, so it can go anywhere: the toast, Library cards, Game detail. |
| &nbsp;&nbsp;[RarityGem.tsx](../src/renderer/src/components/RarityGem.tsx) | The rarity's gem shape (circle, diamond, hexagon, sparkle), picked from a `Record<Rarity, LucideIcon>` table and coloured with a `text-*` class. Decorative (`aria-hidden`): the rarity is always written out as text too. Used in the toast; the Library and Game detail screens will reuse it. |
| &nbsp;&nbsp;[GameCard.tsx](../src/renderer/src/components/GameCard.tsx) | One game: cover, completion % (a gold crown badge at 100%), title, platform, "34 / 42 achievements" and "8 left" or "Completed". "Syncing…" until the game's first sync has read its achievements. Clicking it opens Game detail. Used by the Library grid and the Dashboard's "Nearly there". |
| &nbsp;&nbsp;[CoverArt.tsx](../src/renderer/src/components/CoverArt.tsx) | The Afterglow "colour-in" art: the cover in grey, then in colour up to the completion % (`clip-path`), with a lime line at the edge. Shows the title if there is no image or it fails to load. |
| &nbsp;&nbsp;[TrophyIcon.tsx](../src/renderer/src/components/TrophyIcon.tsx) | The app's trophy mark as an SVG you can colour with a `text-*` class. |
| `features/accounts/` (Real: Steam only) | |
| &nbsp;&nbsp;[Accounts.tsx](../src/renderer/src/features/accounts/Accounts.tsx) | The Accounts page: the Steam connect form, then the account list: a `role="status"` "Loading…" message, then either "No accounts connected yet." or a list (`<ul>`) with one card per account, keyed by id. Passes the hook's `reload` to the form, so a new account appears straight away. |
| &nbsp;&nbsp;[SteamConnectForm.tsx](../src/renderer/src/features/accounts/SteamConnectForm.tsx) | SteamID64 and Steam API key inputs (controlled; the key field is `type="password"`). Submitting calls `window.api.connectSteam`: on success it clears both fields and calls `onConnected`; on failure it shows `ConnectResult.message` in a `role="alert"`. The button is disabled while waiting. The key crosses to the main process once and is never sent back. |
| &nbsp;&nbsp;[AccountCard.tsx](../src/renderer/src/features/accounts/AccountCard.tsx) | One account: platform name (`platformName`), display name, status (a `Record<AccountStatus, ...>` of labels and colours) and "1 game" / "N games". |
| &nbsp;&nbsp;[useAccounts.ts](../src/renderer/src/features/accounts/useAccounts.ts) | Calls `window.api.listAccounts()` and returns `{ accounts, reload }`. `null` means not loaded yet, `[]` means none connected. `reload()` bumps a `version` state that the effect depends on, so the effect runs again; a second effect subscribes to `window.api.onDataChanged` and does the same when a sync changes the data. Same `cancelled` guard as `useDashboardStats`. |
| `features/dashboard/` (Real) | |
| &nbsp;&nbsp;[Dashboard.tsx](../src/renderer/src/features/dashboard/Dashboard.tsx) | The Dashboard page: the completion hero, a row of stat tiles (games tracked, completed, unlocked this week), "Nearly there" (the four unfinished games closest to 100%, as `GameCard`s, left out when there are none) and "Recent unlocks". Clicking a game or an unlock opens Game detail. Shows a `role="status"` "Loading…" message until `useDashboardStats()` resolves. |
| &nbsp;&nbsp;[RecentUnlocks.tsx](../src/renderer/src/features/dashboard/RecentUnlocks.tsx) | The newest dated unlocks: icon, name, game and platform, `RarityChip`, percentage and "Today, 13:42"-style date. Each row opens its game. |
| &nbsp;&nbsp;[CompletionHero.tsx](../src/renderer/src/features/dashboard/CompletionHero.tsx) | The big completion % and an accessible progress bar (`role="progressbar"`, `aria-value*`), not colour alone. |
| &nbsp;&nbsp;[StatTile.tsx](../src/renderer/src/features/dashboard/StatTile.tsx) | One floating-card stat: a label, a `toLocaleString()`-formatted value, and an optional hint line. |
| &nbsp;&nbsp;[useDashboardStats.ts](../src/renderer/src/features/dashboard/useDashboardStats.ts) | Calls `window.api.getDashboard()`, and again on `onDataChanged`. Guards against a late reply (and React StrictMode's double-invoked effect) with a `cancelled` flag. |
| &nbsp;&nbsp;`*.test.tsx` | Component tests for the page, the hero and the stat tile. |
| `features/library/` (Real) | |
| &nbsp;&nbsp;[Library.tsx](../src/renderer/src/features/library/Library.tsx) | The Library page: the game count, a Last unlock / Completion / Name sort (buttons with `aria-pressed`), and a grid of cards. Loading and empty states. |
| &nbsp;&nbsp;[useLibrary.ts](../src/renderer/src/features/library/useLibrary.ts) | Calls `window.api.listLibrary()`, and again whenever `onDataChanged` fires, so the grid fills in while the first sync runs. |
| `features/game-detail/` (Real) | |
| &nbsp;&nbsp;[GameDetail.tsx](../src/renderer/src/features/game-detail/GameDetail.tsx) | One game: a header with a blurred cover behind the title and a back button, four tiles (unlocked with a progress bar, completion, rarest achievement held, last unlock), All / Unlocked / Locked filters with counts, and the achievements rarest first in two columns. |
| &nbsp;&nbsp;[AchievementRow.tsx](../src/renderer/src/features/game-detail/AchievementRow.tsx) | One achievement: its icon (colour when unlocked, Steam's grey one when locked), name, description, unlock date or "Locked", percentage and `RarityChip`. A hidden achievement shows as "Hidden achievement" until unlocked. |
| &nbsp;&nbsp;[useGame.ts](../src/renderer/src/features/game-detail/useGame.ts) | Calls `window.api.getGame(id)`, and again on `onDataChanged`. `undefined` while loading, `null` if the game is gone. |
| [lib/format.ts](../src/renderer/src/lib/format.ts) | Shared text formatting: `formatPercent` (two decimals below 1%), `formatUnlockDate` ("Today, 13:42", "Yesterday, ...", or a date in the user's locale) and `plural`. |
| [test/fake-api.ts](../src/renderer/src/test/fake-api.ts) | `fakeApi()`: the fake `window.api` for component tests. |
| `features/{activity,settings,onboarding}/` (Planned) | Empty folders with a `.gitkeep`. **This is where the remaining screens will live.** |
| [styles/index.css](../src/renderer/src/styles/index.css) | Global CSS and the design tokens: fonts, colours, radii, shadows, the rarity scope (`[data-rarity]` rules that set `--rarity` and friends), plus a `.bg-aurora` background class (defined, not applied yet) and base styles. See section 8. |

---

## 5. Walkthrough: what happens when you click "Send test notification"

Following one real feature through every layer is the fastest way to see how the pieces connect.

1. **Click.** The button in [App.tsx](../src/renderer/src/app/App.tsx) calls `window.api.sendTestNotification()`.
2. **Preload.** [preload/index.ts](../src/preload/index.ts) turns that into `ipcRenderer.invoke(IPC.sendTestNotification)`. The channel name comes from [shared/ipc.ts](../src/shared/ipc.ts).
3. **Main process receives it.** [main/ipc.ts](../src/main/ipc.ts) has an `ipcMain.handle` for that channel. It checks the sender is one of our own pages, then calls the handler.
4. **The handler.** In [main/index.ts](../src/main/index.ts), `sendTestNotification` calls `notifications.show(nextSampleToast())`. `nextSampleToast()` (in `sample-toasts.ts`) returns the next sample, cycling the four rarities.
5. **Notification service.** [notifications.ts](../src/main/notifications.ts) queues it. If fewer than 3 toasts are on screen, it goes on screen now with a new id and a 5-second timer, and the service hands the whole on-screen list to its `display` callback.
6. **Overlay service.** [overlay-service.ts](../src/main/overlay-service.ts) positions the overlay window in the bottom-right of the screen, shows it without taking focus, and sends the list with `webContents.send(IPC.setToasts, ...)`.
7. **The overlay page receives it.** [OverlayApp.tsx](../src/renderer/src/overlay/OverlayApp.tsx) subscribed earlier with `window.api.onToasts(...)` (preload wires that to `ipcRenderer.on`). The callback stores the list in state.
8. **React draws it.** State changed, so React re-renders and mounts a [Toast.tsx](../src/renderer/src/overlay/Toast.tsx) for the new id. Motion animates it in.
9. **Leave and hide.** When its timer fires, the service sends the list without it (Motion plays its exit) and brings in the next queued toast, if any. Once the list is empty, the main process hides the window after the exit animation.

The tray's "Send test notification" item follows the same path from step 4 onward.

A real unlock joins at step 5: the `Scheduler`'s `onUnlocks` callback calls `notifications.notify(events)`, which builds the toasts from the unlock data.

---

## 6. Two things that surprise people

**The renderer hot-reloads; the main process does not.** With `npm run dev`, edits to renderer code appear straight away. Edits to `src/main`, `src/preload`, and any `src/shared` code the main process imports need a full restart (tray **Quit**, then `npm run dev` again). Symptom: the UI shows your new code, but window sizes, tray items and IPC handlers behave as before.

**The overlay's numbers are linked.** The toast is 400x92 (`Toast.tsx`), and up to 3 stack 12px apart (`MAX_VISIBLE` in `notifications.ts`, `gap-3` in `OverlayApp.tsx`). The overlay window is 480x396 (`OVERLAY_SIZE` in `windows.ts`). `OverlayApp.tsx` pads the stack by 40px at the sides, 32px above and 64px below, and the window is the stack plus that padding. Shadows and glows are drawn outside the toast's box, so this padding is the room they have. If you change one of these, change the others, or shadows are cut off at the window edge.

Other things worth knowing:

- Closing the main window **destroys** it (this saves memory). The app keeps running in the tray. Only **Quit** in the tray exits.
- Only one copy of the app can run. A second launch focuses the first, so an open dev instance can make a second launch appear to do nothing.
- Launching Electron from a shell with `ELECTRON_RUN_AS_NODE` set (VS Code's terminal has it) makes it behave as plain Node. See [CLAUDE.md](../CLAUDE.md).
- The main window's initial background colour in `createMainWindow` is still the old navy (`#0B0D12`), not the Afterglow canvas colour. It only shows for an instant before the page paints.
- The app icon in `resources/` is still the old gold-on-navy design.

---

## 7. The database

- **Engine:** Node's built-in `node:sqlite`, so nothing native to compile. It is marked experimental in Node; the rest of the code only depends on a small `SqlDatabase` interface in `migrate.ts`, so switching drivers later is contained.
- **Where SQL lives:** only `src/main/store`. Nothing else may contain SQL.
- **Schema versions:** kept in SQLite's `user_version`. On every start, `applyMigrations()` runs any `NNNN_name.sql` newer than that number.
- **Tables today** (from `0001_init.sql`, plus `platform_game.baseline_cutoff` from `0002`): `account`, `game`, `platform_game`, `achievement`, `unlock`, `sync_state`, `setting`. The full annotated schema is in [SPEC.md](SPEC.md) §3.
- **Secrets are never stored here.** Tokens go through `SecretStore`, keyed by account id.
- **Changing it:** add `src/main/store/migrations/0002_something.sql`, add an upgrade test in `migrate.test.ts`, and update SPEC.md §3. Never edit an applied migration. The `db-migration` project skill walks through it.

---

## 8. Styling

- **Framework:** Tailwind CSS 4. You style with classes, such as `bg-surface-1 rounded-panel p-4`.
- **Tokens live in one place:** the `@theme` block in [styles/index.css](../src/renderer/src/styles/index.css). Every `--color-*`, `--radius-*`, `--shadow-*` and `--font-*` variable there becomes classes automatically. `--color-surface-1` gives `bg-surface-1`, `text-surface-1` and `border-surface-1`. `--shadow-float` gives `shadow-float`.
- **Fonts:** Bricolage Grotesque (`font-display`, for titles and big numbers) and Figtree (`font-sans`, for everything else), bundled through `@fontsource-variable` packages.
- **The design source:** the Superdesign canvas (link in [design/README.md](design/README.md)); the written direction is [DESIGN.md](DESIGN.md) §7.

Rules and traps:

1. **Never hard-code a hex colour in a component.** Use a token. If a token is missing, add one to `@theme`.
2. **Don't name a colour token `base`, `sm`, `lg`, `xl` and so on.** They collide with Tailwind's font-size classes (`text-base` is a size) and silently break text colour.
3. **Write class names in full.** Tailwind finds classes by scanning your source for complete strings. `'border-rarity-rare'` works; `` `border-rarity-${x}` `` does not. This is why `FILL` and `ULTRA_FILL` in `RarityChip.tsx` are written out in full.
4. **Only one `shadow-*` class applies per element.** Two do not combine. To layer shadows, define one token that contains all the layers.
5. **Inside an arbitrary value like `shadow-[...]`, spaces must be underscores.** A real space splits the class in two.
6. **Opacity on a token colour:** `bg-surface-1/60` or `border-rarity-rare/45` (any whole number).
7. **A token that reads a per-element variable needs `@theme inline`.** A normal `@theme` token is resolved once, at the page root, where `--rarity` is not set. `--shadow-toast` and `--shadow-tile` live in an `@theme inline` block, which copies the value into the class so the variable is read on the element.
8. **Rarity colours come from the rarity scope.** Put `data-rarity={rarity}` on an element, then use `text-(--rarity)`, `border-(--rarity)/45`, `bg-(--rarity)/14`, `from-(--rarity-light)`, `to-(--rarity-dark)` and `text-(--rarity-on)`. Adding a rarity means adding a `[data-rarity='...']` rule in `styles/index.css`; the `rarity-scope` test fails if one is missing. Two traps: Tailwind turns an underscore inside `data-[rarity=ultra_rare]:` into a space, so do not use data-attribute variants for rarity; and Motion writes the whole `transform`, so pass skew and similar through Motion (`skewX`), not a Tailwind class.

---

## 9. Documentation and design files

`docs/`:

| File | Answers |
|---|---|
| [DESIGN.md](DESIGN.md) | What the product is, who it is for, the screens, notification behaviour, the Afterglow visual direction (§7), privacy, accessibility, and the decisions made (§11). |
| [SPEC.md](SPEC.md) | Requirements (functional and non-functional), the full DB schema (§3), the provider interface (§4), the sync algorithm (§5), the IPC contract (§6), settings defaults, security and testing strategy. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Code areas and the dependency rule (§2), key data flows (§3), concurrency, overlay window details (§5), the planned folder structure (§6), technology summary (§7), extension points (§8). |
| [PROVIDERS.md](PROVIDERS.md) | Per-platform notes and risks. **Endpoints are unverified**: confirm against a real response before coding. |
| [ROADMAP.md](ROADMAP.md) | Milestones M0 to M6 and what is ticked off. |
| [SCAFFOLD-GUIDE.md](SCAFFOLD-GUIDE.md) | A React and Electron primer using this code, a command cheat sheet, and known gaps. |
| [adr/](adr/) | Architecture decision records. ADR-0003 (Electron, TypeScript, React) is the current stack; ADR-0004 (zod for provider replies) and ADR-0005 (library scope, baseline cutoff, tiered polling) add to it; 0001 and 0002 are superseded. |
| [design/README.md](design/README.md) | The canvas link, the draft ids for each screen, and which file each screen becomes. |
| `design/mockups/*.html` | Seven static snapshots (dashboard, library, game detail, toast, accounts, notification settings, onboarding). **Out of date:** they show the earlier gold-on-navy look. The canvas is the source of truth until they are re-exported. |
| PROJECT-MAP.md | This file. |

Other docs-like things:

- [CLAUDE.md](../CLAUDE.md): the rules Claude Code follows here, including the docs-sync rule.
- `.claude/skills/` (git-ignored, so only on machines that have it): four project skills, `add-provider`, `add-emulator-adapter`, `db-migration`, `write-adr`.
- `.superdesign/` (git-ignored): local design tooling, the design-system files and scripts used to produce the canvas drafts. Not part of the app.

---

## 10. Tests

- **Where:** next to the code, as `*.test.ts` or `*.test.tsx`. Vitest only picks up `src/**/*.test.{ts,tsx}` (see `vitest.config.ts`).
- **Node by default.** A test of a React component opts into a fake browser by putting `// @vitest-environment jsdom` on its first line.
- **Faking the bridge.** Components call `window.api`, which does not exist in a test. Tests assign `fakeApi({...})` from `renderer/src/test/fake-api.ts`: every call is a `vi.fn()`, and a test passes only the ones it cares about.
- **Coverage today** (431 tests in 39 files): migrations, the secret store (encrypted on disk, restarts, refusing to save without encryption, damaged files), the Steam provider (its parsers against real captured replies, its HTTP error mapping with a stubbed `fetch`, and the baseline rule through a real sync pass), the sync engine (its SQL, one sync pass including the baseline rule and rollback, and the Scheduler's timing, backoff, re-login and stop), backoff, provider errors, platform table, rarity thresholds, secret redaction, the App shell, the island nav, the notification service (unlock and burst toasts, at most 3 on screen, queueing, duplicates, pausing, stop), the tray menu and "Start with Windows", the Library (loading, sort, opening a game, live reload), the game card (colour-in, completed, syncing, missing art), Game detail (tiles, filters, rarest first, hidden achievements), text formatting, the Dashboard (`completionPercent`, the hero, the stat tile, "Nearly there", recent unlocks, live reload, and loading/loaded states including under StrictMode), the Accounts page (loading, empty and listed states, reloading after a connect, the card's status labels and game counts, and the Steam connect form's success, failure, waiting and empty-field paths), the overlay, the toast, the rarity gem and chip, and the rarity scope in `index.css`.
- **Who writes them:** Claude does, before every commit and PR (the "Tests are written by Claude" rule in [CLAUDE.md](../CLAUDE.md)).
- **Fixtures:** `tests/fixtures/steam/` holds sanitized Steam Web API replies (see PROVIDERS.md). Fixtures are in `.prettierignore` so they stay byte-for-byte as captured. Sanitized provider responses and sample trophy files go there, **with no real account ids, tokens or emails**. Raw recordings go in `tests/fixtures/_raw/`, which is git-ignored.
- **CSS in tests.** Vitest normally replaces CSS imports with an empty string. `vitest.config.ts` lets `index.css` through so the `rarity-scope` test can read it as text.
- **Not tested by automation:** the real windows, tray, and overlay behaviour. Those are checked by running the app.

---

## 11. Recipes

### A. Add something the UI can ask the main process for (a new IPC call)

Four files, in this order. TypeScript flags any you forget.

1. [shared/ipc.ts](../src/shared/ipc.ts): add a channel to `IPC`, add any payload types, and add the method to `AchievementTrackerApi`.
2. [main/ipc.ts](../src/main/ipc.ts): add it to the `IpcHandlers` interface and add an `ipcMain.handle(...)` that checks `isTrustedSender` first. Validate any payload you accept.
3. [main/index.ts](../src/main/index.ts): implement the handler in the object passed to `registerIpcHandlers`.
4. [preload/index.ts](../src/preload/index.ts): add the method to the `api` object.

Then add a default for it in `renderer/src/test/fake-api.ts`, and mention it in SPEC.md §6.

### B. Build a real screen (for example Activity)

1. Create components in `src/renderer/src/features/<area>/` (Activity's folder already exists). `features/library/` is a complete example.
2. If it needs data, add an IPC call (recipe A), backed by a query in `src/main/store` (`library-store.ts` for read-only screen queries). Have its hook refetch on `window.api.onDataChanged`.
3. In [App.tsx](../src/renderer/src/app/App.tsx), add a `case` to `PageContent` that returns your component. There is no router.
4. Reuse `components/` and the tokens. Add a test file beside your component.
5. Check the design on the canvas first.

### C. Add a design token

Add it to `@theme` in `styles/index.css`, use the class in a component, and note it in DESIGN.md §7 if it is part of the visual direction.

### D. Change the toast

Colours, shadows and radii: tokens in `styles/index.css`. Layout, per-rarity classes and animation: `overlay/Toast.tsx`. Size: `Toast.tsx`, plus `OVERLAY_SIZE` and `OverlayApp.tsx` (section 6). Try it with the tray's "Send test notification".

### E. Add a database table or column

New migration file plus an upgrade test (section 7). Update the row types in `shared` if a provider or the UI needs them.

### F. Add a platform

Add its id to `PLATFORMS` and `PLATFORM_INFO` in `shared/platform.ts` (the compiler lists what else needs updating), implement `AchievementProvider` under `main/providers/<name>/`, add sanitized fixtures and tests, record what you verified in PROVIDERS.md, and add a connect view under `features/accounts/`. Follow the `add-provider` skill.

### G. Add a rarity

Add it to the `Rarity` type, `rarityFromPercent` and `RARITY_LABEL` in `shared/rarity.ts`. The compiler then flags `RarityGem` until it has a shape. Add its colour, gradient-end and glyph tokens to `@theme` in `styles/index.css`, and a `[data-rarity='...']` rule that sets the four `--rarity` variables (the `rarity-scope` test fails until you do). Check the toast and the chip in the running app.

---

## 12. Commands and workflow

| Command | Does |
|---|---|
| `npm run dev` | Runs the app. Hot reload covers renderer code only; main-process changes need a restart (section 6). |
| `npm run format:check` | Checks formatting without changing files. |
| `npm run format` | Fixes formatting. |
| `npm run lint` | ESLint, zero warnings allowed. |
| `npm run typecheck` | TypeScript for main/preload/shared and for the renderer. |
| `npm test` | Vitest. |
| `npm run build` | Typecheck, then a production build into `out/`. |
| `npm start` | Runs the built app from `out/`. |

**Workflow:** branch from `main`, make a change, run the four checks (format:check, lint, typecheck, test), commit, push, and open a pull request to `main`. CI runs the same checks plus `npm run build` on `windows-latest` for every pull request and every push to `main`. After a commit, docs and comments get synced (rule in CLAUDE.md).

**Done means:** the four checks pass, docs are updated if behaviour changed, and UI changes were checked in the running app.

---

## 13. What is real and what is not yet

| Area | Status |
|---|---|
| Shared types, provider interface, errors, secrets | Real |
| Database, migrations, schema | Real |
| Backoff helper | Real |
| App lifecycle, windows, tray, overlay window, IPC, test notification | Real |
| Toast component | Real, in the Afterglow look, stacking up to 3 (platform badge still to do) |
| Floating "island" nav | Real |
| Main window shell (island nav, Dashboard, Library, Game detail and Accounts real; Activity and Settings placeholder) | Mixed |
| Steam provider | Real, verified live, connected from the Accounts screen |
| Other providers | Stubs |
| Accounts screen (connect Steam, list accounts, updates itself) | Real |
| Sync scheduler (library + game scopes, tiered polling, backoff with jitter), sync pass, baseline cutoff, `UnlockEvent` | Real, started with the app with Steam registered |
| Notification service (unlocks to toasts, queue, stacking, bursts, pause) | Real |
| Production `SecretStore` (`safeStorage`, `secrets.json`) | Real |
| Tray: Pause notifications, Start with Windows | Real (Start with Windows only in the installed app) |
| Toast sound, tray "Sync now" and "Recent unlocks" | Planned |
| Dashboard: rarest-unlock card, per-platform breakdown, weekly chart | Planned |
| Activity, Settings and Onboarding screens | Planned |
| Activity screen design | Not designed yet |
| Installer, signing, auto-update | Planned (M6) |

For the order things will be built in, see [ROADMAP.md](ROADMAP.md).

---

## 14. Where to read next

- New to React: [SCAFFOLD-GUIDE.md](SCAFFOLD-GUIDE.md) §5, which explains components, props, state, effects and keys using this code.
- Before a non-trivial change: the docs listed at the top of [CLAUDE.md](../CLAUDE.md).
- Before touching a platform: [PROVIDERS.md](PROVIDERS.md).
- To see the design: the Superdesign canvas, via [design/README.md](design/README.md).
