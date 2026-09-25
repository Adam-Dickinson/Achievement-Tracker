# Project Map: where everything is

A guide to finding your way around the repo: what each folder and file is for, how the pieces connect, and where to work for each kind of change.

- New to the codebase? Read sections 1 to 3, then follow the walkthrough in section 5.
- Know what you want to change? Jump to the lookup table in section 2, or the recipes in section 11.
- New to React or Electron? [SCAFFOLD-GUIDE.md](SCAFFOLD-GUIDE.md) is the primer; this document is the map.

**Status labels used below.** **Real**: implemented and tested. **Placeholder**: works but is temporary. **Stub**: an empty file that marks where code will go. **Planned**: does not exist yet.

**The code has no comments.** Explanations live here and in the other docs; the only comments left are instructions to tools (`/// <reference types=...>` in `env.d.ts` and `// @vitest-environment jsdom` in UI tests). When you need to know why a file does something, look it up here first.

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
| Change the app icon | [resources/](../resources/) and [assets/logo.svg](../src/renderer/src/assets/logo.svg) | The "Colour-in" logo: a keyhole trophy on a midnight aurora tile, filled with lime up to a glowing edge like the game art. `icon.svg` is the full design, `icon-small.svg` the 24–32px version (no aurora or glow, thicker mark) and `icon-tiny.svg` the 16px one (no keyhole). The PNGs and the ICO are rendered from them by `.superdesign/generator/logo/icons.mjs` (git-ignored, needs Chrome): `icon.ico` (16–256, the small versions at 16–32) for the window, `icon.png` (512), and `tray.png`/`tray@2x.png` (16/32) for the tray. The island nav shows `assets/logo.svg`. |
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
| [eslint.config.mjs](../eslint.config.mjs) | Lint rules. Node globals for main/preload/shared, browser globals plus React-hooks rules for the renderer. Ignores build output, mockups, `resources`, `.superdesign` and `tests/fixtures/_raw` (local-only recordings and capture scripts, which git ignores too). | Changing rules (fix warnings rather than disabling them). |
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
| [secret.ts](../src/shared/secret.ts) | `Secret`: wraps a token so printing or serializing it shows `Secret(<redacted>)` (it overrides `toString`, `toJSON` and Node's `util.inspect.custom`, which `console.log` uses). The only way to read it is `expose()`. |
| [secret-store.ts](../src/shared/secret-store.ts) | The `SecretStore` interface and an in-memory implementation used by tests. The production version is `main/safe-storage-secret-store.ts`. |
| [ipc.ts](../src/shared/ipc.ts) | **The IPC contract.** Channel names (`IPC`), payload types (`AppInfo`, `ToastPayload`, `AccountSummary`, `SteamConnectInput`, `ConnectResult`), and `TrophyLockerApi`, the exact shape of `window.api`. This is the first place to look when the UI and main process need to talk. |
| [dashboard.ts](../src/shared/dashboard.ts) | `DashboardStats` (the Dashboard's numbers, "Nearly there" and recent unlocks) and `completionPercent()`, a floor-not-round percentage. |
| [library.ts](../src/shared/library.ts) | What the Library, Game detail and Dashboard screens receive: `LibraryGame`, `GameAchievement`, `GameDetail`, `RecentUnlock`. |

Tests sit beside the code: `errors.test.ts`, `platform.test.ts`, `rarity.test.ts`, `secret.test.ts`, `dashboard.test.ts`.

### 4.2 `src/main/`: the main process (Node.js)

Top-level files (Real unless noted):

| File | What it does |
|---|---|
| [index.ts](../src/main/index.ts) | **The entry point and wiring.** Takes the single-instance lock (a second launch just shows the first window); creates the main window on demand; keeps the app alive with no windows open (the tray keeps it reachable); hardens every window (no popups, no navigation away, except the EA sign-in window within `ea.com`); opens the database; starts the sync `Scheduler` with the Steam, Xbox, Epic, Ubisoft and EA providers and the `SafeStorageSecretStore`, logging each unlock's timing (`unlock-timing.ts`) before handing it to the notification service; creates the `XboxSignIn` (with `shell.openExternal` for the browser) and shows the main window again when an Xbox sign-in finishes (it idles until an account is connected); creates the `UbisoftSignIn` with `openUbisoftSignInWindow` (the window is a child of the main window); stops both sign-ins on quit; creates the overlay and the tray; registers IPC handlers. Services are plain modules wired together here by hand. There is no DI container ([ARCHITECTURE.md](ARCHITECTURE.md) §2). |
| [windows.ts](../src/main/windows.ts) | Creates both windows. Holds the shared security settings (`contextIsolation` on, `nodeIntegration` off, `sandbox` on, preload script). `createMainWindow()`: 1440x900, minimum 1024x680, shown once ready to avoid a white flash. `createOverlayWindow()`: transparent, frameless, always on top, click-through, unable to take focus. Also exports `OVERLAY_SIZE`. Loads the dev server URL in development and the built file in production. |
| [safe-storage-secret-store.ts](../src/main/safe-storage-secret-store.ts) | `SafeStorageSecretStore`, the production `SecretStore`. Encrypts each secret with Electron `safeStorage` (Windows DPAPI) and keeps it as base64 in `secrets.json` in the app's data folder, keyed by account id. Refuses to save without OS encryption; a secret it can't decrypt reads as missing; a damaged file throws rather than being overwritten; writes go to a temporary file first, then a rename. `safeStorage` is passed in, so `safe-storage-secret-store.test.ts` uses a fake. |
| [coalesce.ts](../src/main/coalesce.ts) | `coalesce(fn, ms)`: a burst of calls runs `fn` once. Used so a first sync of every game refreshes the UI at most once a second. |
| [unlock-timing.ts](../src/main/unlock-timing.ts) | `describeUnlockTiming(event)`: one log line per unlock with the time it was found, the platform's unlock time and the seconds between them. `index.ts` logs it for every unlock, so a real unlock during `npm run dev` shows how quickly it was picked up. |
| [notifications.ts](../src/main/notifications.ts) | `NotificationService`: turns `UnlockEvent`s into toasts (`unlockToast`, `burstToast`), keeps at most 3 on screen for 5 s each and queues the rest, drops duplicates, and collapses more than 5 at once into one toast. While `paused` (the tray's "Pause notifications"), unlocks are not shown; the test notification still is. Hands the on-screen list to a `display` callback. Tested with fake timers in `notifications.test.ts`. |
| [overlay-service.ts](../src/main/overlay-service.ts) | `OverlayService.display(toasts)`: waits for the overlay page to load, then either positions and shows the window without stealing focus, or (for an empty list) hides it after the exit animation, and sends the list over IPC. |
| [tray.ts](../src/main/tray.ts) | Creates the tray icon with the menu from `tray-menu.ts`. Clicking the icon opens the window. It is a native Electron menu, so it has no React and no visual design. |
| [tray-menu.ts](../src/main/tray-menu.ts) | `trayMenuTemplate(actions)`: Open Trophy Locker, Send test notification, Pause notifications (checkbox), Start with Windows (checkbox, greyed out in development), Quit. Kept apart from `tray.ts` so it can be tested without Electron. |
| [legacy-data.ts](../src/main/legacy-data.ts) | `moveLegacyData(appData, userData)`: a one-time move from the app's old name. If `%APPDATA%\achievement-tracker` has a database and the new `trophy-locker` folder doesn't, it renames the whole old folder to the new one and renames `achievement-tracker.db` (and its `-wal`/`-shm` files) to `trophy-locker.db`. The whole folder moves, not just the database and `secrets.json`, because on Windows `safeStorage`'s key lives in the folder's `Local State` file. `index.ts` runs it before anything else, since Chromium reads `Local State` once the app is ready; if the move fails (usually because the old app is still open) it shows an error box and quits. `DATABASE_FILE` is the database file name. |
| [startup.ts](../src/main/startup.ts) | "Start with Windows": `startWithWindows(app)` registers the installed app to start at login with `--hidden` (null in development), and `launchedHidden(argv)` makes such a start stay in the tray. |
| [ipc.ts](../src/main/ipc.ts) | `registerIpcHandlers()`: one `ipcMain.handle` per channel. Each first checks the sender is one of our own pages (`isTrustedSender`); `connectSteam`, `connectXbox`, `connectEpic` and `connectUbisoft` then check their payload with a zod schema (answering `invalid_input` if it fails; the last three need `acceptedUnofficial: true`) before calling the handler passed in from `index.ts`. `ipc.test.ts` replaces `electron` with a stand-in to test both checks. |
| [accounts.ts](../src/main/accounts.ts) | `signInToSteam()` (ADR-0011): runs the Steam cookie sign-in, takes the SteamID from the refresh token and the Web API key from `readApiKey` (no key: `NO_API_KEY_MESSAGE`), connects the account like `connectSteam`, keeps the refresh token beside the key (`withFamily`) only when `includeFamily` is true, and calls `Scheduler.lookForGamesNow`. `connectSteam()`: `authenticate` and `validate` with Steam, `upsertAccount`, save the key in the `SecretStore` under the account's id, `Scheduler.startAccount`. Turns failures into a `ConnectResult` (a rejected key, a connection problem, or the provider's own message) and never throws. `connectXbox()` does the same for Xbox after the browser sign-in (`signIn`), answering `cancelled` for a cancelled, timed-out or declined sign-in. `connectEpic()` finds the code in the pasted text (`readAuthorizationCode`), then does the same for Epic, answering `code_rejected` when Epic refuses the code. `connectUbisoft()` runs the Ubisoft sign-in window (`signIn`), hands its remember-me ticket to the provider as a `token`, and saves the rotated one; a closed, cancelled or timed-out window answers `cancelled`. The "cancelled / timed out / not completed" wording is shared by Xbox and Ubisoft (`SIGN_IN_MESSAGES`). Tested in `accounts.test.ts` with fake providers. |
| [sign-in-error.ts](../src/main/sign-in-error.ts) | `SignInError` and its `reason` (`cancelled`, `timed_out`, `denied`), thrown by the Xbox, Ubisoft, EA and Steam family sign-ins and turned into `cancelled` answers by `accounts.ts`. |
| [cookie-sign-in.ts](../src/main/cookie-sign-in.ts) | `isOnDomain(cookieDomain, domain)` (a cookie on the domain or a subdomain) and `CookieSignIn`: the sign-in flow for services whose sign-in leaves cookies (EA, the Steam family library), configured with the service's name, its sign-in address, a reader that picks the sign-in out of the window's cookies, and the window to open; written against a small `CookieSignInWindow` interface so it is tested without Electron. `run()` opens the window and resolves with the reader's `Secret` the first time the window arrives back on the service's home page with a sign-in. It closes the window when done. Fails with a `SignInError`: `cancelled` (window closed, `cancel()`, or another `run()`), `timed_out` after 10 minutes. Settles once. `cookie-sign-in.test.ts` drives it with a fake window and EA's reader. |
| [cookie-sign-in-window.ts](../src/main/cookie-sign-in-window.ts) | `openCookieSignInWindow(page, url)`: the Electron half (ADR-0010, ADR-0011). `page` says the window's title, the service's home origin, its cookie domain and its navigation rule. Set up like the Ubisoft window (sandboxed, context isolation, no Node, no preload, a fresh in-memory session that refuses every permission, a plain Chrome user agent), plus that navigation rule. Each time it arrives on a home-origin page other than `/login…`, it reads all the throwaway session's cookies and keeps those on the service's domain or any of its subdomains (`isOnDomain` in `cookie-sign-in.ts`), whatever their path (EA sets `sid` and `remid` for `/connect`), and hands their names and values to the flow. It does not use Electron's own `cookies.get({ domain })` filter: that returns only cookies set for the whole domain (`.steampowered.com`) and skips ones set on a single subdomain, such as Steam's refresh cookie on `login.steampowered.com` (found when the first in-app Steam sign-in never finished). `index.ts` defines the two pages (`EA_SIGN_IN_PAGE`, `STEAM_SIGN_IN_PAGE`). No unit test (it needs Electron); checked by running the app. |
| [navigation.ts](../src/main/navigation.ts) | Per-window exceptions to the app-wide "no navigation" rule. `allowNavigation(contents, rule)` gives one window a rule, `mayNavigate(contents, url)` is what `index.ts`'s `will-navigate` handler asks (no rule means blocked), and `isEaAddress(url)` is the EA window's rule (`https://` on `ea.com` or a subdomain) and `isSteamAddress(url)` the Steam family window's (`https://` on `steampowered.com`, `steamcommunity.com` or their subdomains). |
| [chrome-user-agent.ts](../src/main/chrome-user-agent.ts) | `chromeUserAgent(userAgent)`: removes `Electron/…` and the app's own name, leaving a plain Chrome user agent, for the Ubisoft, EA and Steam sign-in windows. |
| [ubisoft-sign-in.ts](../src/main/ubisoft-sign-in.ts) | `UbisoftSignIn`: the Ubisoft sign-in flow, written against a small `SignInWindow` interface so it is tested without Electron. `run()` opens the window at `UBISOFT_SIGN_IN_URL` (`account.ubisoft.com/login`) and resolves with the remember-me ticket (a `Secret`) from the first session reply that has one (`readSignInReply`), ignoring replies without a session (a wrong password, a 2-step prompt). It closes the window when done. Fails with a `SignInError`: `cancelled` if the user closes the window, `cancel()` is called or another `run()` starts; `timed_out` after 10 minutes. Settles once. `ubisoft-sign-in.test.ts` drives it with a fake window. |
| [ubisoft-sign-in-window.ts](../src/main/ubisoft-sign-in-window.ts) | `openUbisoftSignInWindow()`: the Electron half (ADR-0009). A `BrowserWindow` that is sandboxed, has context isolation, no Node and no preload, runs in a fresh in-memory session (a random partition name, cache off) that refuses every permission, and sends a plain Chrome user agent. The app-wide rules in `index.ts` still block pop-ups and top-level navigation, so only email and password sign-in works. It attaches the window's DevTools protocol (`webContents.debugger`), follows the sign-in iframe with `Target.setAutoAttach`, and reads only the body of 200 replies to `POST https://public-ubiservices.ubi.com/v3/profiles/sessions`. No unit test (it needs Electron); checked by running the app. |
| [xbox-sign-in.ts](../src/main/xbox-sign-in.ts) | `XboxSignIn`: the browser half of the Xbox sign-in. `run()` starts a one-shot HTTP server on `127.0.0.1` (a random port), opens the Microsoft sign-in page with PKCE and a random `state`, and waits for the redirect to `http://localhost:<port>/`. It ignores other paths and a wrong `state`, shows "Signed in..." in the browser tab, and closes gently so that page arrives. Fails with a `SignInError` (`cancelled`, `timed_out` after 5 minutes, or `denied`); `cancel()` or a second `run()` stops a waiting one. `xbox-sign-in.test.ts` drives it with a real server and a fake browser. |
| [sample-toasts.ts](../src/main/sample-toasts.ts) | Four sample unlocks, one per rarity, cycled by `nextSampleToast()`. Only used by "Send test notification", which queues them like real unlocks. |
| [env.d.ts](../src/main/env.d.ts) | Type declarations for Vite and electron-vite features such as `import.meta.glob` and the `?asset` import suffix. |

`?asset`: `windows.ts` imports the icon as `icon.ico?asset` and `tray.ts` imports `tray.png?asset` (Electron picks up `tray@2x.png` beside it on high-DPI screens). That is an electron-vite feature that gives you a file path which still works after the app is built.

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
| [library-store.ts](../src/main/store/library-store.ts) | Read-only SQL for the screens: `listLibraryGames` (each game with its cover and unlocked/total; most recent unlock first, relying on SQLite sorting NULL last in `DESC`), `getGameDetail`, `listRecentUnlocks` (with each achievement's description), `listActivity` (the Activity page: `listRecentUnlocks` for one more than the limit, to know whether there are more) and `getDashboardStats`. Tested in `library-store.test.ts` on a real schema, with data added through `sync-store`. |
| [sync-store.test.ts](../src/main/store/sync-store.test.ts) | Each query against a real migrated in-memory database, plus the baseline rule end to end. |

The database file is `trophy-locker.db` inside Electron's per-user data folder (`app.getPath('userData')`, normally under `%APPDATA%` on Windows).

**`sync/`: keeping data fresh (Real, game scope; idle until an account is connected)**

The design and the as-built behaviour (outcomes table, what is not built yet) are in [SPEC.md](SPEC.md) §5.

- [sync-pass.ts](../src/main/sync/sync-pass.ts): `runSyncPass()`, **what** one sync of one game does. Fetches from the provider, then in one transaction upserts achievements, inserts unlocks and applies the baseline rule (the first sync of a game records everything but returns no events). Returns the `UnlockEvent`s only after the commit.
- [scheduler.ts](../src/main/sync/scheduler.ts): the `Scheduler`, **when** syncs happen. `lookForGamesNow(accountId)` makes the library look due at once (keeping its last look, so new games still get the baseline cutoff) and starts the account; the Steam family connect uses it. One loop per connected account; each round first lets the provider renew its tokens (`refreshCredentials`, calling the optional `refresh`, and saving a rotated secret in the `SecretStore`; ADR-0007), then reads the library (`syncLibrary`: `listGames`, then `addPlatformGames` with the baseline cutoff), then syncs the games that are due (`syncDueGames`), with recently played games every 5 minutes and the rest every 6 hours. `startAccount(id)` syncs a newly connected account straight away, never running two rounds of one account at once. It also starts each connected account's provider `watch()` (Steam's local signals), and `syncGameNow(accountId, gameId)` syncs a game the watch reports at once: it skips a game that is backing off, looks a game it doesn't know up in the library once (then not again until the next library look), and folds reports that arrive mid-sync into one more sync. `onDataChanged` fires when a library look adds games, a game syncs or a login expires; `main/index.ts` forwards it to the main window as `data:changed`, at most once a second (`coalesce.ts`). Outcomes go in `sync_state` (backoff on network trouble, `needs_reauth` on an expired login). `stop()` cancels timers and in-flight calls. New unlocks go to its `onUnlocks` callback.
- [backoff.ts](../src/main/sync/backoff.ts): `backoffDelayMs()` gives exponential retry delays, and `withJitter()` adds up to 20% at random.
- Tests beside each: `sync-pass.test.ts` and `scheduler.test.ts` use a fake provider and a fake clock; `backoff.test.ts`.

**`providers/`: one folder per platform (Steam, Xbox, Epic and Ubisoft Real, the rest Stubs)**

- [http.ts](../src/main/providers/http.ts): `retryAfterMs()`, which reads a `Retry-After` header given in seconds or as a date. Shared by the Steam and Xbox API helpers.

- `steam/` (Real, verified live; notes and captured replies in [PROVIDERS.md](PROVIDERS.md)):
  - [index.ts](../src/main/providers/steam/index.ts): `SteamProvider`. `authenticate` checks the key and SteamID64 format, then confirms them with Steam; `validate` returns the display name; `listGames` returns the owned games with achievements plus recently played games you don't own (Steam Families); `fetchGame` makes three requests at once (schema, the player's unlocks, rarity) and merges them. Registered in `src/main/index.ts`. **Family library (ADR-0011):** when the stored secret also holds the family sign-in (`{ key, family }`; a plain key still works), `listGames` adds the family games: a 24-hour session minted from the refresh token (one at a time, kept until an hour before it ends), the family's shareable games owned by others, and only those with achievements (learnt once per app run from the store, or the schema for delisted games). Any family failure is logged and leaves the usual list. `now` can be passed for tests.
  - [session.ts](../src/main/providers/steam/session.ts): Steam's sign-in token. `readSteamSecret`/`withFamily` (the stored secret: a plain key, or `{ key, family }`), `readSteamSignIn`/`signInSteamId` (the `steamRefresh_steam` cookie from the sign-in window and its SteamID), `requestSteamSession(refresh, 'store' | 'community')` (the website's `ajaxrefresh` → `settoken` renewal with that site's `Origin`/`Referer`; only ever posts the ticket to that site's `/login/settoken`; error replies are `auth_expired`) and `readApiKey` (a community session, then the key on `steamcommunity.com/dev/apikey`; `null` when the page has none, `auth_expired` on a redirect to sign in).
  - [family.ts](../src/main/providers/steam/family.ts): the Steam family library. `fetchFamilyApps` (family group, then the shared library, keeping shareable games other members own), `fetchStoreAchievementFlags` (category 22 from `IStoreBrowseService/GetItems`, 50 games a request, `null` for delisted games) and `toFamilyGame`.
  - [api.ts](../src/main/providers/steam/api.ts): `steamGet()`, the only code that calls Steam. Turns HTTP failures into `ProviderError` kinds (HTML 401/403 = `auth_expired`, 429 = `rate_limited`, 5xx and connection failures = `network`) and hands any JSON body, even on a 400/403, to the parsers. Never puts the URL (which holds the key) in an error.
  - [parse.ts](../src/main/providers/steam/parse.ts): zod schemas for each reply (ADR-0004) and the mapping to `Remote*` types.
  - [local.ts](../src/main/providers/steam/local.ts): Steam's local signals, behind `SteamProvider.watch()`. Finds Steam's folder from the registry (`SteamPath`), watches `appcache/stats` with `fs.watch` and reports a game 500 ms after this account's `UserGameStats_<accountid>_<appid>.bin` last changed. Every 5 s it reads `RunningAppID` with `reg query`; while a game runs under this account (`ActiveProcess\ActiveUser`), it reports that game at once and every 30 s. Never touches the game itself (rule 4). The registry and folder access are passed in (`SteamLocalDeps`), so tests use fakes; off Windows it does nothing.
  - Tests beside each, using the fixtures in `tests/fixtures/steam/` and a stubbed `fetch`; `local.test.ts` uses fake timers and the real `reg query` output format.
- `xbox/` (Real, verified live; unofficial and opt-in; notes and captured replies in [PROVIDERS.md](PROVIDERS.md)):
  - [index.ts](../src/main/providers/xbox/index.ts): `XboxProvider`. `authenticate` takes the Microsoft sign-in code (`oauth_code`) and runs the token chain; the account is keyed by XUID. It keeps each account's XSTS session and newest refresh token in memory: `refresh` (ADR-0007) renews the session 5 minutes before it expires and returns the rotated refresh token for the Scheduler to save; `validate` reads the gamertag from the session. `listGames` reads the title history; `fetchGame` asks for up to 1000 achievements per page (contract 4) and follows `continuationToken`. A `401` drops the session and retries once. Registered in `src/main/index.ts`.
  - [api.ts](../src/main/providers/xbox/api.ts): `xblGet()` sends the Xbox Live headers (`Authorization`, `x-xbl-contract-version`, `Accept-Language`) and maps 401 to `auth_expired`. Below it, `xboxFetch()` handles what every Microsoft endpoint shares (connection failure and 5xx = `network`, 429 = `rate_limited`) and returns other replies with their body, so `auth.ts` can read Microsoft's and Xbox's error codes. Errors name only the host, never the URL (which holds the XUID) or a token.
  - [auth.ts](../src/main/providers/xbox/auth.ts): the sign-in pieces. `createPkce()` and `authorizeUrl()` for the browser step; `exchangeCode()`, `refreshTokens()`, `xboxUserToken()` and `xstsSession()` for the token chain, each checking its reply with zod. `invalid_grant` on a refresh means `auth_expired`; XSTS `XErr` codes (no Xbox profile, child account...) become plain messages. `XBOX_CLIENT_ID` is our Azure app's ID (not a secret).
  - [parse.ts](../src/main/providers/xbox/parse.ts): zod schemas and mappers. `parseTitleHistory()` keeps titles with Xbox achievements (`sourceVersion` 2) and picks https, resized art (cover: `TitledHeroArt`, then `SuperHeroArt`, then `BoxArt`); `parseAchievementsPage()` reads one page; `toGameAchievements()` makes only `Achieved` achievements into unlocks and maps the year-1 "never" date to `null`. `check()` is shared with `auth.ts`.
  - Tests beside each, using the fixtures in `tests/fixtures/xbox/` and a stubbed `fetch`.
- `epic/` (Real, verified live; unofficial and opt-in; notes and captured replies in [PROVIDERS.md](PROVIDERS.md)):
  - [index.ts](../src/main/providers/epic/index.ts): `EpicProvider`. `authenticate` takes the pasted code (`token`) and signs in; the account is keyed by Epic account ID. Like Xbox it keeps each account's session and newest refresh token in memory, and `refresh` renews the session 30 minutes before its 36 hours run out, handing back the rotated refresh token (ADR-0007). `listGames` reads every library page and the playtime, keeps only namespaces with Epic achievements, and takes titles and covers from the catalog, falling back to the library's `sandboxName`; which games have achievements, and their title and cover, are remembered for a day. A game counts as recently played if its playtime grew since the last look (on the first look: any playtime). `fetchGame` asks for the achievements (no token) and the player's unlocks (with the token) at once. A `401` drops the session and retries once. Registered in `src/main/index.ts`.
  - [api.ts](../src/main/providers/epic/api.ts): `epicGet()` and `epicGraphql()`, over `epicFetch()`, which sends the launcher's user agent and maps connection failures and 5xx to `network` (including the HTML page GraphQL sends for a bad token) and 429 to `rate_limited`. `epicGet` maps 401/403 to `auth_expired`; `epicGraphql` turns the store's `errors[]` into `other`. Errors name only the host.
  - [auth.ts](../src/main/providers/epic/auth.ts): `EPIC_SIGN_IN_URL`, `readAuthorizationCode()` (the bare code or the whole page Epic shows), `exchangeCode()` and `refreshSession()` with the launcher's client credentials. A used code or a dead refresh token is `auth_expired`.
  - [parse.ts](../src/main/providers/epic/parse.ts): zod schemas and mappers for the library, playtime, achievement list and count, player unlocks and catalog. Covers on `cdn1.epicgames.com` are resized to 920 px wide; `tier` is Epic's bronze/silver/gold; an unlock the list doesn't know is dropped.
  - Tests beside each, using the fixtures in `tests/fixtures/epic/` and a stubbed `fetch`, plus the baseline rule through a real sync pass.
- `ea/` (Real, verified against a real account; unofficial and opt-in; notes and captured replies in [PROVIDERS.md](PROVIDERS.md), sign-in in [ADR-0010](adr/0010-ea-sign-in-window.md)):
  - [index.ts](../src/main/providers/ea/index.ts): `EaProvider`. `authenticate` takes the sign-in window's cookies (`token`), trades them for a 4-hour token and reads the identity (`me.player`): the account is keyed by EA account ID (`pd`), and the persona ID (`psd`) the achievements service needs stays in memory with the token and the newest cookies. **Only `authenticate` and `refresh` ask EA for a token**, so rotated cookies are always ones that get saved; they are kept the moment the token reply arrives, even if the identity lookup after it fails. `refresh` renews 30 minutes before the token ends; concurrent renewals for one account share one request, and a renewal ignores the abort signal. `listGames` and `fetchGame` use the cached token only and ask for a retry (`network`) when it is missing or rejected. `listGames` is two GraphQL queries (owned PC games from the EA, Steam and Epic storefronts with their key art, then their achievement sets and last sessions); `fetchGame` asks the achievements service for one set. Rarity when EA has it. Registered in `src/main/index.ts`.
  - [api.ts](../src/main/providers/ea/api.ts): `eaFetch` (network, `429` and `5xx` mapping, and the `Set-Cookie` lines), `eaGraphql` (GET with the query in the address and a bearer token; `UNAUTHENTICATED`, which EA sends with HTTP 200, and `401` mean `auth_expired`) and `eaAchievements` (`X-AuthToken`; `401`/`403` mean `auth_expired`).
  - [auth.ts](../src/main/providers/ea/auth.ts): the stored secret is one JSON value holding `sid`, `remid` and `_nx_mpcid`. `readSignInCookies` picks them from the window's cookies (none without `sid`); `requestToken` sends them to `accounts.ea.com/connect/auth` with a browser user agent, reads the token (`expires_in` comes as a string) and applies `Set-Cookie` rotations, ignoring deletions; `login_required` (HTTP 200) or an unreadable secret is `auth_expired`.
  - [parse.ts](../src/main/providers/ea/parse.ts): zod-checked parsers. `parseOwned` keeps base games with a trimmed title and the key art resized to 920 px wide (`?w=920`); `parseLibrary` keeps one game per achievement set (the set ID is the game's `externalId`; games without a set are left out), with its latest session (EA's 1970 date means none); `parseAchievements` sorts by ID, dates an unlock by `state.st_ct` or `u` (only when `complete`, since `u` is "now" otherwise), keeps `hidden`, and reads rarity only when the set has any non-zero percentage.
- `ubisoft/` (Real, verified against a real account; unofficial and opt-in; notes and captured replies in [PROVIDERS.md](PROVIDERS.md), sign-in in [ADR-0009](adr/0009-ubisoft-sign-in-window.md)):
  - [index.ts](../src/main/providers/ubisoft/index.ts): `UbisoftProvider`. `authenticate` takes the sign-in window's remember-me ticket (`token`) and trades it for a launcher session; the account is keyed by Ubisoft user ID. Each account's session and newest remember-me ticket stay in memory. **Only `authenticate` and `refresh` renew the session**, so every rotated ticket is one that gets saved: `refresh` renews 30 minutes before the 3-hour session ends and hands back the rotated ticket, and concurrent renewals for one account share one request, since Ubisoft revokes a reused ticket. A renewal ignores the abort signal so its reply is never lost. `listGames` and `fetchGame` use the cached session only; with none, or when Ubisoft rejects it, they drop it and throw a retryable `network` error so the next round renews. `listGames` is one GraphQL query and `fetchGame` another. No rarity. Registered in `src/main/index.ts`.
  - [api.ts](../src/main/providers/ubisoft/api.ts): `UBISOFT_LAUNCHER_APP_ID` and `ubisoftGraphql()`, over `ubisoftFetch()`, which maps connection failures and 5xx to `network` and 429 to `rate_limited`. A 401, or an `INVALID_TICKET`/`UNAUTHENTICATED` error code, is `auth_expired`; any other GraphQL error is `other` with Ubisoft's message.
  - [auth.ts](../src/main/providers/ubisoft/auth.ts): `refreshSession()` (a remember-me ticket for a launcher session and a new remember-me ticket; the expiry is timed from Ubisoft's own `serverTime`, so a wrong local clock does not matter; a 401/403 with a Ubisoft error code is `auth_expired`) and `readSignInReply()` (the remember-me ticket from the sign-in page's reply, or null).
  - [parse.ts](../src/main/providers/ubisoft/parse.ts): zod schemas and mappers. `parseLibrary` keeps games with at least one achievement, once each, keyed by space ID, with the icon, the landscape background as the cover (resized to 920 px on `ubiservices.cdn.ubi.com`), `lastPlayed`, and "recently played" for the last 14 days. `parseAchievements` maps every achievement and the unlocked ones; an unlock date without a time zone is read as UTC.
  - Tests beside each, using the fixtures in `tests/fixtures/ubisoft/` and a stubbed `fetch`, plus the baseline rule through a real sync pass.
- `playstation/`, `retroachievements/`, `rpcs3/`, `xenia/`, `ea/`, `local-file/`: Stubs. Each contains an `index.ts` with a comment describing the plan and `export {}`. Next is EA (M3), then PlayStation (M4; ADR-0008); the emulator stubs (`retroachievements/`, `rpcs3/`, `xenia/`, `local-file/`) wait until after v1 (ADR-0006). Providers are pure adapters: they return `Remote*` objects and never touch SQL, notifications or the UI. Notes on each platform are in [PROVIDERS.md](PROVIDERS.md); endpoints there are unverified until you capture a real response.

### 4.3 `src/preload/`: the bridge (Real)

[index.ts](../src/preload/index.ts) builds the `window.api` object and exposes it with `contextBridge.exposeInMainWorld`. Its entries today: `getAppInfo`, `sendTestNotification`, `listAccounts`, `connectSteam`, `connectXbox`, `cancelXboxSignIn`, `openEpicSignIn`, `connectEpic`, `connectUbisoft` and `cancelUbisoftSignIn` (all `ipcRenderer.invoke`), and two subscriptions that each return an "unsubscribe" function: `onToasts` (the list of toasts on screen) and `onDataChanged`. Also `listLibrary`, `getGame`, `getDashboard` and `listActivity`. The UI never receives `ipcRenderer` itself. Its type is `TrophyLockerApi` from `shared/ipc.ts`, so the compiler tells you if the two drift apart.

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
| &nbsp;&nbsp;[UnlockRow.tsx](../src/renderer/src/components/UnlockRow.tsx) | One unlock as a list row (`<li>` with a button that opens its game): icon (a trophy if there is none or it fails to load), name, optional description, game and platform, `RarityChip`, percentage and a `when` text the caller formats. Used by the Dashboard's recent unlocks and the Activity page. |
| &nbsp;&nbsp;[TrophyIcon.tsx](../src/renderer/src/components/TrophyIcon.tsx) | A plain trophy mark as an SVG you can colour with a `text-*` class (used on the unlock toast; the app logo is `assets/logo.svg`). |
| `features/activity/` (Real) | |
| &nbsp;&nbsp;[Activity.tsx](../src/renderer/src/features/activity/Activity.tsx) | The Activity page: every dated unlock, newest first, in one section per day ("Today", "Yesterday", then the full date, with a count), each an `UnlockRow` with its description and time. A **Show more** button while there are more. Loading and empty states. |
| &nbsp;&nbsp;[useActivity.ts](../src/renderer/src/features/activity/useActivity.ts) | Calls `window.api.listActivity(limit)`, starting at 50; `showMore()` raises the limit by 50 (up to 1,000), which re-runs the effect. Reloads on `onDataChanged` with the same limit. Returns `{ page, canShowMore, showMore }`. |
| &nbsp;&nbsp;[groupByDay.ts](../src/renderer/src/features/activity/groupByDay.ts) | Splits the newest-first unlocks into days by the local calendar date. |
| `features/accounts/` (Real) | |
| &nbsp;&nbsp;[Accounts.tsx](../src/renderer/src/features/accounts/Accounts.tsx) | The Accounts page: the Steam connect form and the Xbox, Epic and Ubisoft connect cards (two to a row on wide windows), then the account list: a `role="status"` "Loading…" message, then either "No accounts connected yet." or a list (`<ul>`) with one card per account, keyed by id. Passes the hook's `reload` to every connect card, so a new account appears straight away. |
| &nbsp;&nbsp;[EpicConnectCard.tsx](../src/renderer/src/features/accounts/EpicConnectCard.tsx) | The Epic connect card (a form): says the connection is unofficial and how the code works, an "I understand" checkbox that enables **Open Epic sign-in** (`openEpicSignIn`) and **Connect**, and a "Code from Epic" box (controlled) that takes the code or the whole page. Connect is also disabled while the box is empty or a connection is running ("Connecting…"). It calls `connectEpic({ code, acceptedUnofficial: true })` and empties the box either way, since a used code never works again; on success it unticks the box and calls `onConnected`, otherwise it shows `ConnectResult.message` in a `role="alert"`. |
| &nbsp;&nbsp;[EaConnectCard.tsx](../src/renderer/src/features/accounts/EaConnectCard.tsx) | The EA connect card, built like the Ubisoft card: it says a window with EA's own sign-in page will open, asks to tick "Remember me", says only the sign-in EA leaves in that window is kept and that the connection is unofficial. The "I understand" checkbox enables **Sign in with EA** (`connectEa({ acceptedUnofficial: true })`); while it waits, a status message and **Cancel** (`cancelEaSignIn`) appear. On success it unticks the box and calls `onConnected`; otherwise it shows `ConnectResult.message` in a `role="alert"`. |
| &nbsp;&nbsp;[UbisoftConnectCard.tsx](../src/renderer/src/features/accounts/UbisoftConnectCard.tsx) | The Ubisoft connect card, built like the Xbox card: it says a window with Ubisoft's own sign-in page will open, that only the "remember me" sign-in is kept, and that the connection is unofficial. The "I understand" checkbox enables **Sign in with Ubisoft**, which calls `connectUbisoft({ acceptedUnofficial: true })`; while it waits, the button reads "Signing in…", the checkbox is locked, and a `role="status"` message and a **Cancel** button (`cancelUbisoftSignIn`) appear. On success it unticks the box and calls `onConnected`; otherwise it shows `ConnectResult.message` in a `role="alert"`. |
| &nbsp;&nbsp;[XboxConnectCard.tsx](../src/renderer/src/features/accounts/XboxConnectCard.tsx) | The Xbox connect card: says the connection is unofficial and signs in in the browser, and has an "I understand" checkbox (controlled) that must be ticked before **Sign in with Microsoft** is enabled (rule 5). Clicking calls `window.api.connectXbox({ acceptedUnofficial: true })`; while it waits, the button reads "Signing in…", the checkbox is locked, and a `role="status"` message and a **Cancel** button (`cancelXboxSignIn`) appear. On success it unticks the box and calls `onConnected`; otherwise it shows `ConnectResult.message` in a `role="alert"`. |
| &nbsp;&nbsp;[SteamConnectCard.tsx](../src/renderer/src/features/accounts/SteamConnectCard.tsx) | The **Connect Steam** card (ADR-0011). It says Steam's own sign-in page opens and that the app reads the account's Web API key from it. "Also add my Steam family library" is ticked by default and says plainly that it keeps Steam's sign-in, which can act as the account. The "unofficial" checkbox enables **Sign in with Steam** (`signInToSteam({ includeFamily, acceptedUnofficial: true })`); while waiting, the controls lock and a status and **Cancel** (`cancelSteamSignIn`) appear; on success it unticks the opt-in and calls `onConnected`; on failure it shows the message (for example "no Web API key yet") in a `role="alert"`. A `<details>` "Use an API key instead" holds `SteamConnectForm` as the fallback. |
| &nbsp;&nbsp;[SteamConnectForm.tsx](../src/renderer/src/features/accounts/SteamConnectForm.tsx) | The fallback inside `SteamConnectCard` ("Connect with an API key", no panel of its own): SteamID64 and Steam API key inputs (controlled; the key field is `type="password"`). Submitting calls `window.api.connectSteam`: on success it clears both fields and calls `onConnected`; on failure it shows `ConnectResult.message` in a `role="alert"`. The button is disabled while waiting. The key crosses to the main process once and is never sent back. |
| &nbsp;&nbsp;[AccountCard.tsx](../src/renderer/src/features/accounts/AccountCard.tsx) | One account: platform name (`platformName`), display name, status (a `Record<AccountStatus, ...>` of labels and colours) and "1 game" / "N games". |
| &nbsp;&nbsp;[useAccounts.ts](../src/renderer/src/features/accounts/useAccounts.ts) | Calls `window.api.listAccounts()` and returns `{ accounts, reload }`. `null` means not loaded yet, `[]` means none connected. `reload()` bumps a `version` state that the effect depends on, so the effect runs again; a second effect subscribes to `window.api.onDataChanged` and does the same when a sync changes the data. Same `cancelled` guard as `useDashboardStats`. |
| `features/dashboard/` (Real) | |
| &nbsp;&nbsp;[Dashboard.tsx](../src/renderer/src/features/dashboard/Dashboard.tsx) | The Dashboard page: the completion hero, a row of stat tiles (games tracked, completed, unlocked this week), "Nearly there" (the four unfinished games closest to 100%, as `GameCard`s, left out when there are none) and "Recent unlocks". Clicking a game or an unlock opens Game detail. Shows a `role="status"` "Loading…" message until `useDashboardStats()` resolves. |
| &nbsp;&nbsp;[RecentUnlocks.tsx](../src/renderer/src/features/dashboard/RecentUnlocks.tsx) | The newest dated unlocks as `UnlockRow`s with a "Today, 13:42"-style date. Each row opens its game. |
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
| [lib/format.ts](../src/renderer/src/lib/format.ts) | Shared text formatting: `formatPercent` (two decimals below 1%), `formatTime`, `formatUnlockDate` ("Today, 13:42", "Yesterday, ...", or a date in the user's locale), `formatDayHeading` ("Today", "Yesterday", or the weekday and full date) and `plural`. |
| [test/fake-api.ts](../src/renderer/src/test/fake-api.ts) | `fakeApi()`: the fake `window.api` for component tests. |
| `features/{settings,onboarding}/` (Planned) | Empty folders with a `.gitkeep`. **This is where the remaining screens will live.** |
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
9. **Font names end in "Variable".** `@fontsource-variable` registers `'Figtree Variable'` and `'Bricolage Grotesque Variable'`, so `--font-sans` and `--font-display` must use those names.
10. **`--color-line` is translucent white**, so a border takes on the colour of the card it sits on.
11. **`.bg-aurora` is for the main window only.** The overlay window must stay transparent.
12. **In `Toast.tsx`, opacity is animated with a short tween, not the spring,** so it can't overshoot past fully visible.

---

## 9. Documentation and design files

`docs/`:

| File | Answers |
|---|---|
| [DESIGN.md](DESIGN.md) | What the product is, who it is for, the screens, notification behaviour, the Afterglow visual direction (§7), privacy, accessibility, and the decisions made (§11). |
| [SPEC.md](SPEC.md) | Requirements (functional and non-functional), the full DB schema (§3), the provider interface (§4), the sync algorithm (§5), the IPC contract (§6), settings defaults, security and testing strategy. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Code areas and the dependency rule (§2), key data flows (§3), concurrency, overlay window details (§5), the planned folder structure (§6), technology summary (§7), extension points (§8). |
| [PROVIDERS.md](PROVIDERS.md) | Per-platform notes and risks. **Endpoints are unverified**: confirm against a real response before coding. |
| [ROADMAP.md](ROADMAP.md) | Milestones M0 to M6, what is ticked off, and the emulators planned for after v1. |
| [SCAFFOLD-GUIDE.md](SCAFFOLD-GUIDE.md) | A React and Electron primer using this code, a command cheat sheet, and known gaps. |
| [adr/](adr/) | Architecture decision records. ADR-0003 (Electron, TypeScript, React) is the current stack; ADR-0004 (zod for provider replies) and ADR-0005 (library scope, baseline cutoff, tiered polling) add to it; ADR-0006 sets the v1 providers (launchers and consoles; emulators after v1); ADR-0007 has providers refresh their own tokens while the scheduler saves them; ADR-0008 moves Epic, Ubisoft and EA (M3) ahead of PlayStation (M4); ADR-0009 signs in to Ubisoft on its own page in a locked-down app window and sets the rules for its rotating tickets; ADR-0010 does the same for EA, keeping only its sign-in cookies and letting that window navigate within `ea.com`; ADR-0011 adds the whole Steam family library through Steam's own sign-in, keeping its refresh token beside the API key; 0001 and 0002 are superseded. |
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
- **Coverage today** (978 tests in 73 files): migrations, the one-time move of the data folder from the old name, the secret store (encrypted on disk, restarts, refusing to save without encryption, damaged files), the Steam provider (its parsers against real captured replies, its HTTP error mapping with a stubbed `fetch`, the baseline rule through a real sync pass, and its local watch: registry parsing, stats file names, debouncing and the running-game cycle), the Xbox provider (its parsers against real captured replies, the sign-in token chain and its error codes, the HTTP error mapping, session caching, refresh-token rotation, paging and the retry after a `401`), the Epic provider (its parsers against real captured replies, the pasted-code sign-in and refresh, HTTP and GraphQL error mapping, library filtering with catalog titles, the one-day cache, playtime-based recent games, and the baseline rule through a real sync pass), the Ubisoft provider (its parsers against real captured replies, the remember-me renewal and its rotation, one renewal at a time, never renewing outside `refresh`, HTTP and GraphQL error mapping, and the baseline rule through a real sync pass), the Ubisoft sign-in flow (a reply with a ticket, replies without one, closing, cancel, timeout, a second sign-in), the EA provider (its parsers against real captured replies, one game per achievement set, covers, partial rarity, unlock times, the token request with its string `expires_in`, cookie rotation and deletions, `login_required` and `UNAUTHENTICATED` sent with HTTP 200, single-flight renewal, keeping rotated cookies when the rest of a renewal fails, never renewing outside `refresh`, and the baseline rule through a real sync pass), the cookie sign-in flow (the reader's sign-in once back home, waiting without one, closing with the service's name, cancel, timeout, a second sign-in), the Steam family library (the stored secret with and without it, the refresh cookie, the `ajaxrefresh`/`settoken` renewal with its headers, error 79 and a foreign `login_url`, the family group and shared library, store categories in batches of 50 and delisted games, merging without duplicates, schema checks only for delisted games, caching the session and the flags, renewing an hour early, and keeping the rest of Steam when the family sign-in fails), signing in to Steam (the key read from Steam, keeping or dropping the family token, an account without a key, cancelled and timed-out sign-ins, a refused renewal, network failures), the Steam session (store and community renewals, reading the key from the developer page, a page without a key, a redirect to sign in), `lookForGamesNow`, the per-window navigation rule, `isEaAddress` and `isSteamAddress`, the Chrome user agent, the Xbox browser sign-in (a real loopback server: the code, a forged `state`, cancel, timeout, closing), connecting a Steam, Xbox, Epic, Ubisoft or EA account, the sync engine (its SQL, one sync pass including the baseline rule and rollback, and the Scheduler's timing, backoff, credential refresh, re-login, watches, `syncGameNow` and stop), the unlock timing line, backoff, provider errors, platform table, rarity thresholds, secret redaction, the App shell, the island nav (including the wordmark and its decorative logo), the notification service (unlock and burst toasts, at most 3 on screen, queueing, duplicates, pausing, stop), the tray menu and "Start with Windows", the Library (loading, sort, opening a game, live reload), the game card (colour-in, completed, syncing, missing art), Game detail (tiles, filters, rarest first, hidden achievements), text formatting, the Dashboard (`completionPercent`, the hero, the stat tile, "Nearly there", recent unlocks, live reload, and loading/loaded states including under StrictMode), the Activity page (day groups, rows, opening a game, "Show more" and its limit, empty state, live reload), the Accounts page (loading, empty and listed states, reloading after a connect, the card's status labels and game counts, and the Steam connect form's success, failure, waiting and empty-field paths, the Xbox connect card's opt-in, waiting, cancel and failure paths, the Epic connect card's opt-in, opening the sign-in, pasting, connecting and failure paths, and the Ubisoft and EA connect cards' opt-in, waiting, cancel and failure paths, and the Steam card's family choice and warning, opt-in, waiting, cancel, failure and API-key fallback), the overlay, the toast, the rarity gem and chip, and the rarity scope in `index.css`.
- **Who writes them:** Claude does, before every commit and PR (the "Tests are written by Claude" rule in [CLAUDE.md](../CLAUDE.md)).
- **Fixtures:** `tests/fixtures/steam/` holds sanitized Steam Web API replies and `tests/fixtures/xbox/` sanitized Microsoft and Xbox Live replies with fake tokens, XUID and gamertag (see PROVIDERS.md). Fixtures are in `.prettierignore` so they stay byte-for-byte as captured. Sanitized provider responses and sample trophy files go there, **with no real account ids, tokens or emails**. Raw recordings go in `tests/fixtures/_raw/`, which is git-ignored.
- **Numbers in tests follow the machine's locale.** `toLocaleString()` gives "3,482" or "3 482" (with a non-breaking space), so tests build the expected text with `toLocaleString()` too, and replace `\s` with a plain space, because Testing Library normalizes whitespace in the rendered text.
- **Electron menu clicks:** Electron flips a checkbox item's `checked` before calling its `click`, so `tray-menu.test.ts` passes the new state in the fake item.
- **CSS in tests.** Vitest normally replaces CSS imports with an empty string. `vitest.config.ts` lets `index.css` through so the `rarity-scope` test can read it as text.
- **Not tested by automation:** the real windows, tray, and overlay behaviour. Those are checked by running the app.

---

## 11. Recipes

### A. Add something the UI can ask the main process for (a new IPC call)

Four files, in this order. TypeScript flags any you forget.

1. [shared/ipc.ts](../src/shared/ipc.ts): add a channel to `IPC`, add any payload types, and add the method to `TrophyLockerApi`.
2. [main/ipc.ts](../src/main/ipc.ts): add it to the `IpcHandlers` interface and add an `ipcMain.handle(...)` that checks `isTrustedSender` first. Validate any payload you accept.
3. [main/index.ts](../src/main/index.ts): implement the handler in the object passed to `registerIpcHandlers`.
4. [preload/index.ts](../src/preload/index.ts): add the method to the `api` object.

Then add a default for it in `renderer/src/test/fake-api.ts`, and mention it in SPEC.md §6.

### B. Build a real screen (for example Settings)

1. Create components in `src/renderer/src/features/<area>/` (Settings' folder already exists). `features/library/` and `features/activity/` are complete examples.
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
| Main window shell (island nav, Dashboard, Library, Game detail, Activity and Accounts real; Settings placeholder) | Mixed |
| Steam provider | Real, verified live, connected from the Accounts screen; near real-time through its local watch (stats files and the running game) |
| Xbox provider | Real, verified live, connected from the Accounts screen |
| Epic provider | Real, verified live, connected from the Accounts screen |
| Ubisoft provider | Real, verified live, connected from the Accounts screen |
| Other providers | Stubs |
| Accounts screen (connect Steam, list accounts, updates itself) | Real |
| Sync scheduler (library + game scopes, tiered polling, backoff with jitter), sync pass, baseline cutoff, `UnlockEvent` | Real, started with the app with Steam registered |
| Notification service (unlocks to toasts, queue, stacking, bursts, pause) | Real |
| Production `SecretStore` (`safeStorage`, `secrets.json`) | Real |
| Tray: Pause notifications, Start with Windows | Real (Start with Windows only in the installed app) |
| Toast sound, tray "Sync now" and "Recent unlocks" | Planned |
| Dashboard: rarest-unlock card, per-platform breakdown, weekly chart | Planned |
| Activity screen | Real (built without a canvas design) |
| Settings and Onboarding screens | Planned |
| Installer, signing, auto-update | Planned (M6) |

For the order things will be built in, see [ROADMAP.md](ROADMAP.md).

---

## 14. Where to read next

- New to React: [SCAFFOLD-GUIDE.md](SCAFFOLD-GUIDE.md) §5, which explains components, props, state, effects and keys using this code.
- Before a non-trivial change: the docs listed at the top of [CLAUDE.md](../CLAUDE.md).
- Before touching a platform: [PROVIDERS.md](PROVIDERS.md).
- To see the design: the Superdesign canvas, via [design/README.md](design/README.md).
