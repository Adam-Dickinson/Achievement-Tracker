# Architecture

Stack: Electron, TypeScript and React. Decision and alternatives: [ADR-0003](adr/0003-electron-typescript-react.md).

## 1. System overview

```
┌──────────────────────────────── Electron app ────────────────────────────────┐
│                                                                              │
│  MAIN PROCESS (Node.js)                       RENDERER PROCESSES (Chromium)  │
│  ┌────────────────────────────────────┐       ┌────────────────────────────┐ │
│  │ Providers ─► Sync engine ─► Store  │       │ Main window (React)        │ │
│  │ (steam, xbox, psn, ra,     (SQLite)│  IPC  │  Dashboard, Library, ...   │ │
│  │  rpcs3, ...)   │                   │◄─────►│                            │ │
│  │      ▲         ▼                   │       │ Overlay window (React)     │ │
│  │  Watchers   UnlockEvent            │       │  transparent, click-through│ │
│  │  (fs.watch)     │                  │       │  └─ <Toast>                │ │
│  │      ▲          ▼                  │       └────────────────────────────┘ │
│  │  Game detector  Overlay service ───┼─────────────────►                    │
│  │  (process list) (queue, DND)       │   preload script = the only bridge   │
│  │                                    │   (window.api, sandboxed)            │
│  │ Tray · single instance · windows   │                                      │
│  └────────────────────────────────────┘                                      │
└──────────────────────────────────────────────────────────────────────────────┘
      │ HTTPS                      │ file system              │ safeStorage (DPAPI)
      ▼                            ▼                          ▼
Steam / Xbox / PSN / RA APIs   RPCS3 / Xenia / Steam files   Tokens & API keys
```

The **main process** owns everything with side effects: windows, tray, database, network, files. The **renderer** processes only draw UI. They talk over IPC through the **preload** script, which exposes a tiny typed API as `window.api`; the UI has no Node.js access.

Closing the main window destroys it (freeing its renderer, ~90 MB). The tray icon, the hidden overlay window and (from M1) the watchers and sync tasks keep running. "Quit" in the tray menu is the only way to exit. With "Start with Windows" on (installed app only), Windows starts the app at login with `--hidden`, and it stays in the tray until opened.

## 2. Code areas

| Folder | Runs in | Responsibility |
|---|---|---|
| `src/shared` | both | Domain types (`Platform`, `Rarity`, `RemoteGame`, `UnlockEvent`...), the `AchievementProvider` interface, `ProviderError`, `Secret`, `SecretStore`, and the **IPC contract** (`ipc.ts`). Depends on nothing else in the repo. |
| `src/main/store` | main | SQLite access, SQL migrations, migration runner. **The only place SQL lives.** |
| `src/main/providers` | main | One folder per platform/emulator implementing `AchievementProvider` |
| `src/main/sync` | main | Scheduler (`scheduler.ts`), one sync pass with the baseline rule (`sync-pass.ts`), backoff; game detector later (M2) |
| `src/main` (root files) | main | App lifecycle (`index.ts`), windows, tray, overlay service, IPC handlers |
| `src/preload` | preload (sandboxed) | Builds `window.api` from the IPC contract |
| `src/renderer` | renderer | The React UI: `app/` shell, `features/*` screens, `components/` shared UI, `overlay/` toast, `styles/` |

### Dependency rule
`shared` ← `main/store`, `main/providers` ← `main/sync` ← `main` (app). The renderer imports only `shared` (types, rarity helpers) and never anything from `main`. Providers never touch the store; the UI never calls providers (it asks the main process through IPC).

### Service composition
The main process is wired by hand, with no dependency-injection library. Each service (the store, the secret store, the sync engine, the notification service...) is a plain function or class that receives what it needs as arguments. `src/main/index.ts` is the one place that creates them and hands them to each other, which keeps every service easy to test with fakes. Revisit this only if the wiring in `index.ts` becomes hard to follow. Decided 2026-09-21.

## 3. Key data flows

### Unlock detection (polling provider)
1. The scheduler fires for `(account, scope)`
2. The provider fetches remote state; the sync engine diffs it against the store
3. New unlocks are inserted in one transaction; **after commit** an `UnlockEvent` is published
4. The overlay service applies DND/settings and sends the toast to the overlay window over IPC
5. The same event is pushed to the main window so its lists update live

### Unlock detection (local watcher, e.g. RPCS3)
`fs.watch` notices a change, the provider debounces (200-500 ms) and signals `onChange(gameRef)`. The sync engine re-fetches and diffs exactly as above (steps 2-5). Watchers never emit unlocks themselves.

### Auth (OAuth-style, e.g. Xbox)
The UI asks the main process to begin the flow (`connectXbox`); the main process opens the system browser at the sign-in page with PKCE and waits on a one-shot loopback server (`main/xbox-sign-in.ts`), exchanges tokens itself, stores the long-lived secret via `SecretStore`, creates the account row and closes the flow. Tokens never reach the renderer. Short-lived tokens stay in the provider's memory, and the Scheduler saves a rotated secret at the start of each round (ADR-0007).

### An unlock toast (implemented)
The `Scheduler` hands a sync pass's `UnlockEvent`s to `NotificationService.notify()` (`main/notifications.ts`), after the pass has committed. The service turns each into a `ToastPayload` (platform name, rarity from the global %, `null` description for hidden achievements), drops duplicates of toasts already on screen or waiting, and collapses more than 5 at once into one "N achievements unlocked" toast led by the rarest. It keeps **at most 3 on screen**, each for 5 s, the rest queued in order. Every change sends the whole on-screen list (`VisibleToast[]`, oldest first, each with a stable id) through `OverlayService.display()` → `overlay:set-toasts` → the overlay's `OverlayApp` (via `window.api.onToasts`) draws them stacked, newest at the bottom, and Motion animates arrivals, departures and the stack shifting. When the list empties, the main process hides the window after the exit animation.

The queue and timers live in the main process, not the overlay page, so they are plain Node code tested with fake timers, and the overlay stays a dumb view. The test notification (button or tray) goes through the same queue with `NotificationService.show()`.

## 4. Concurrency model

- Everything in main is `async`/`await` on the Node event loop; **one supervised long-running task per (account, provider)** so a failing provider can't affect others (N-10). Built as the `Scheduler`'s per-account loop: each round re-arms itself with `setTimeout`, so rounds never overlap, and an unexpected error is logged and retried at the normal interval instead of ending the loop.
- Every provider call takes an `AbortSignal` (cancel on disconnect and on quit). `Scheduler.stop()` aborts it on quit.
- The database is SQLite in WAL mode via the synchronous `node:sqlite` API. Keep queries small and batch writes in transactions so the event loop is never blocked for long (move to a worker thread if profiling shows a need).
- The renderer never blocks main: it only awaits IPC calls

## 5. Overlay window details

- One `BrowserWindow`, **created hidden at startup** (so a toast appears instantly) and reused
- Options: `transparent`, `frame: false`, `alwaysOnTop` at the `screen-saver` level, `skipTaskbar`, `focusable: false`, `hasShadow: false`, not resizable/movable
- `setIgnoreMouseEvents(true)` makes it click-through. Verified on Windows: the window carries `WS_EX_TRANSPARENT` (click-through) and `WS_EX_NOACTIVATE` (never takes focus). Shown with `showInactive()` so it never activates.
- `OverlayService` positions it in the bottom-right of the primary display's **work area** (DIP coordinates from `screen.getPrimaryDisplay()`), 16 px from the edges. Corner and monitor selection are settings (M5).
- Sized for three stacked toasts (480x396 DIPs, `OVERLAY_SIZE`); shown while any toast is on screen and hidden once the list is empty and the exit animation has played
- Exclusive-fullscreen games render above normal windows, so a fallback native Windows notification is planned (DESIGN §6)
- The toast (`overlay/Toast.tsx`) picks its colours from a per-rarity lookup table and animates with Motion (slide + fade; a one-off shimmer for Ultra Rare; only a fade if the OS requests reduced motion)
- Nothing is injected into any other process: the overlay only changes its own window

## 6. Folder structure

```
achievement-tracker/
├── package.json  package-lock.json
├── electron.vite.config.ts          # build config for main, preload and renderer (2 HTML entries)
├── vitest.config.ts                 # test config (Node by default; UI tests opt in to jsdom)
├── tsconfig.json  tsconfig.node.json  tsconfig.web.json
├── eslint.config.mjs  .prettierrc.json  .editorconfig
├── resources/                       # app icon (png, ico, svg)
├── .github/workflows/ci.yml         # format check, lint, typecheck, test, build
├── docs/
│   ├── DESIGN.md  SPEC.md  ARCHITECTURE.md  PROVIDERS.md  ROADMAP.md  SCAFFOLD-GUIDE.md
│   ├── adr/                         # architecture decision records
│   └── design/                      # README + mockups/*.html (reference designs)
├── src/
│   ├── shared/                      # runs in main AND renderer
│   │   ├── platform.ts  rarity.ts  secret.ts  secret-store.ts
│   │   ├── models.ts  errors.ts  provider.ts
│   │   └── ipc.ts                   # channel names, payload types, the window.api interface
│   ├── main/
│   │   ├── index.ts                 # app lifecycle: single instance, windows, tray, IPC, sync wiring
│   │   ├── windows.ts  tray.ts  tray-menu.ts  startup.ts  overlay-service.ts  notifications.ts  ipc.ts  accounts.ts  sample-toasts.ts
│   │   ├── store/                   # migrations/*.sql, migrations.ts, migrate.ts, database.ts,
│   │   │                            #   sync-store.ts (the sync engine's SQL)
│   │   ├── sync/                    # scheduler.ts, sync-pass.ts, backoff.ts (+ detector in M2)
│   │   └── providers/               # steam/ xbox/ playstation/ retroachievements/ rpcs3/
│   │                                #   xenia/ epic/ ubisoft/ ea/ local-file/   (steam and xbox real, the rest stubs)
│   ├── preload/index.ts             # exposes window.api
│   └── renderer/
│       ├── index.html  overlay.html # one entry per window
│       └── src/
│           ├── main.tsx  env.d.ts   # window entry; types for window.api
│           ├── app/                 # App.tsx, IslandNav.tsx, navigation.ts
│           ├── overlay/             # main.tsx, OverlayApp.tsx, Toast.tsx
│           ├── components/          # Button.tsx, TrophyIcon.tsx, RarityChip.tsx... (shared UI)
│           ├── lib/                 # format.ts: shared text formatting
│           ├── test/                # fake-api.ts: the fake window.api for component tests
│           ├── features/            # dashboard/ library/ game-detail/ activity/
│           │                        #   accounts/ settings/ onboarding/   (dashboard, library, game-detail and accounts started)
│           └── styles/index.css     # design tokens (Tailwind @theme) + base styles
└── tests/fixtures/                  # sanitized provider responses / sample trophy files
```

Tests live next to the code they test (`*.test.ts`, `*.test.tsx`).

## 7. Technology summary

| Concern | Choice |
|---|---|
| Shell | Electron 44 (Chromium 152, Node 24) |
| Language | TypeScript 6.0, strict, `noUncheckedIndexedAccess` |
| UI | React 19, Tailwind CSS 4 (tokens in `@theme`), Motion (animation), lucide-react (icons) |
| Fonts | Bricolage Grotesque and Figtree, bundled with `@fontsource-variable/*` |
| Build | electron-vite 5 on Vite 7 |
| DB | `node:sqlite` (built into Node), plain SQL migrations |
| Secrets | Electron `safeStorage` (DPAPI) behind `SecretStore`, stored encrypted in `secrets.json` |
| HTTP | Node `fetch` (M1) |
| Validating provider replies | zod 4 schemas, main process only ([ADR-0004](adr/0004-zod-for-provider-responses.md)) |
| File watching | `fs.watch` + debounce |
| Process detection | `tasklist` / a small library (M2) |
| Testing | Vitest; Testing Library + jsdom for UI |
| Quality | ESLint (zero warnings), Prettier, GitHub Actions |
| Packaging | electron-builder (M6) |

## 8. Extension points

- **New platform:** add `src/main/providers/<name>/` implementing `AchievementProvider`, add the id to `PLATFORMS`/`PLATFORM_INFO` (the compiler lists what else needs updating), register it, and add a connect view under `renderer/src/features/accounts/`.
- **New emulator (file-based):** implement the provider with `watch()` plus a path auto-detector.
- **New IPC call:** add the channel and types to `shared/ipc.ts`, handle it in `main/ipc.ts`, expose it in `preload/index.ts`. TypeScript flags any of the three you forget.
- **New notification style:** the toast is an ordinary React component, so themes are Tailwind classes only.
