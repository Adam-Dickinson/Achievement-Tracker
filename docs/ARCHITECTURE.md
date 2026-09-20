# Architecture

## 1. System overview

```
┌──────────────────────────── Tauri app process ────────────────────────────┐
│                                                                           │
│  ┌─────────────── Rust core ────────────────┐     ┌──── WebView UIs ────┐ │
│  │                                          │     │                     │ │
│  │  Providers ──► Sync engine ──► Store     │     │  Main window (React)│ │
│  │  (steam, xbox, psn, ra,        (SQLite)  │ IPC │  Dashboard/Library  │ │
│  │   rpcs3, ...)      │                     │◄───►│  Settings/Accounts  │ │
│  │      ▲             ▼                     │     │                     │ │
│  │  Watchers     Unlock events              │     │  Overlay window     │ │
│  │  (notify)          │                     │     │  (transparent,      │ │
│  │      ▲             ▼                     │     │   click-through)    │ │
│  │  Game detector  Notification service ────┼────►│  Toast component    │ │
│  │  (sysinfo)     (queue, DND, sound)       │     └─────────────────────┘ │
│  │                                          │                             │
│  │  Tray · Autostart · Single-instance · Updater · Keychain               │
│  └──────────────────────────────────────────┘                             │
└───────────────────────────────────────────────────────────────────────────┘
        │ HTTPS                       │ file system                │ OS keychain
        ▼                             ▼                            ▼
  Steam / Xbox / PSN / RA APIs   RPCS3 / Xenia / Steam files   Tokens & API keys
```

The app is a **single process**. Closing the main window destroys only that webview. The Rust core, tray, watchers and hidden overlay window keep running.

## 2. Components

| Component | Responsibility | Crate/module |
|---|---|---|
| **Domain** | Shared types (`Platform`, `RemoteGame`, `UnlockEvent`, errors), provider trait | `crates/core` |
| **Store** | SQLite access, migrations, queries. Only place SQL lives. | `crates/store` |
| **Providers** | One module per platform/emulator implementing the trait | `crates/providers` |
| **Sync engine** | Scheduler, diffing, baseline rule, backoff, emits `UnlockEvent`s | `crates/sync` |
| **Watchers** | Filesystem watch (via providers) and running-game detection | `crates/sync` |
| **Notification service** | Queue, de-dup, DND, sound, chooses overlay vs native toast | `src-tauri/src/notify` |
| **Secrets** | Keychain wrapper (`SecretStore` trait, keyring impl + in-memory test impl) | `crates/core` |
| **App shell** | Tauri setup, tray, windows, IPC command handlers, autostart, updater | `src-tauri` |
| **Frontend** | UI, state, IPC client (generated bindings) | `src/` |

### Dependency rule
`core` ← `store`, `providers` ← `sync` ← `src-tauri`. `core` depends on nothing internal. Providers never touch the store, and the UI never talks to providers directly.

## 3. Key data flows

### Unlock detection (polling provider)
1. Scheduler in `sync` fires for `(account, scope)`
2. Provider fetches remote state, and `sync` diffs it against the store
3. New unlocks are inserted in a transaction, and after commit an `UnlockEvent` is sent on an mpsc channel
4. Notification service dequeues, applies DND/settings, and emits to the overlay window (and/or native toast)
5. Same event emitted to the main window (`achievement://unlocked`) so lists update live

### Unlock detection (local watcher, e.g. RPCS3)
Watcher notices a file change, debounces (200-500 ms), re-parses the file, and follows the same diff and event path from step 2. Steps 3-5 are unchanged.

### Auth (OAuth-style, e.g. Xbox)
Main window calls `begin_connect` and Rust opens a sandboxed auth webview. Redirect is intercepted, tokens exchanged in Rust, secrets go to the keychain, account row is created, and the webview is destroyed. Tokens never reach the frontend.

## 4. Concurrency model

- `tokio` multi-thread runtime; **one supervised task per (account, provider)** so failures are isolated (N-10)
- Bounded channels between sync and notifications; a slow UI never blocks sync
- SQLite in WAL mode; a single writer via connection pool, and reads are concurrent
- Cancellation via `tokio_util::CancellationToken` on disconnect/quit

## 5. Overlay window details

- Created at startup: `transparent: true, decorations: false, always_on_top: true, skip_taskbar: true, focus: false, visible: false, shadow: false`
- `set_ignore_cursor_events(true)` for click-through
- Sized to the toast stack region and positioned on the chosen monitor's work area corner (DPI-aware)
- Shown/hidden per queue state; not destroyed, so latency stays low
- On Windows, the extended style `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` is applied via the `windows` crate so it never steals focus from the game

## 6. Folder structure

```
achievement-tracker/
├── .claude/
│   └── skills/                     # project skills for Claude Code
│       ├── add-provider/SKILL.md
│       ├── add-emulator-adapter/SKILL.md
│       ├── db-migration/SKILL.md
│       └── write-adr/SKILL.md
├── .github/
│   └── workflows/ci.yml            # fmt, clippy, test, lint, build
├── docs/
│   ├── DESIGN.md
│   ├── SPEC.md
│   ├── ARCHITECTURE.md
│   ├── PROVIDERS.md
│   ├── ROADMAP.md
│   ├── adr/                        # architecture decision records
│   └── design/                     # mockups, exported design assets
├── crates/                         # Rust workspace members
│   ├── core/                       # domain types, provider trait, errors, SecretStore
│   │   └── src/{lib.rs, platform.rs, model.rs, provider.rs, error.rs, secrets.rs}
│   ├── store/                      # SQLite layer
│   │   ├── migrations/             # 0001_init.sql, ...
│   │   └── src/{lib.rs, accounts.rs, games.rs, achievements.rs, unlocks.rs, settings.rs}
│   ├── providers/
│   │   └── src/
│   │       ├── lib.rs              # registry: Platform -> Box<dyn AchievementProvider>
│   │       ├── steam/              # mod.rs, api.rs, local_stats.rs, vdf.rs
│   │       ├── xbox/               # mod.rs, auth.rs, api.rs
│   │       ├── playstation/        # mod.rs, auth.rs, api.rs
│   │       ├── retroachievements/  # mod.rs, api.rs
│   │       ├── rpcs3/              # mod.rs, tropusr.rs (binary parser), watcher.rs
│   │       ├── xenia/              # (spike)
│   │       ├── epic/               # (spike)
│   │       ├── ubisoft/            # (spike)
│   │       ├── ea/                 # (spike)
│   │       └── local_file/         # generic user-defined watcher
│   └── sync/                       # scheduler, diff engine, game detector, events
│       └── src/{lib.rs, scheduler.rs, diff.rs, detector.rs, events.rs, backoff.rs}
├── src-tauri/                      # Tauri app (thin shell over the crates)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/               # Tauri permission sets
│   ├── icons/
│   └── src/
│       ├── main.rs
│       ├── lib.rs                  # builder, plugin registration, state
│       ├── commands/               # IPC handlers by area (accounts, library, sync, settings)
│       ├── notify/                 # queue, overlay window mgmt, sound, native fallback
│       ├── tray.rs
│       └── bindings.rs             # tauri-specta export -> src/lib/bindings.ts
├── src/                            # React + TypeScript frontend
│   ├── main.tsx
│   ├── app/                        # router, providers, layout shell
│   ├── features/
│   │   ├── dashboard/
│   │   ├── library/
│   │   ├── game-detail/
│   │   ├── activity/
│   │   ├── accounts/               # connect flows per platform
│   │   ├── settings/
│   │   └── onboarding/
│   ├── overlay/                    # separate entry (overlay.html): Toast + queue view
│   ├── components/                 # shared UI (shadcn/ui based)
│   ├── lib/                        # bindings.ts (generated), query client, utils
│   └── styles/                     # tailwind config, tokens
├── tests/
│   ├── fixtures/                   # sanitized provider responses / sample trophy files
│   └── e2e/                        # Playwright
├── overlay.html                    # overlay window entry
├── index.html                      # main window entry
├── Cargo.toml                      # workspace manifest
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── CLAUDE.md
├── README.md
└── .gitignore
```

## 7. Technology summary

| Concern | Choice |
|---|---|
| Shell | Tauri 2 (plugins: tray, autostart, single-instance, updater, notification, shell-open) |
| Backend language | Rust (stable), `tokio`, `reqwest`, `serde`, `thiserror`, `tracing` |
| DB | SQLite via `sqlx` + migrations |
| Secrets | `keyring` |
| File watching | `notify` (+ debouncer) |
| Process detection | `sysinfo` |
| Binary parsing | `binrw` / `nom` |
| IPC types | `tauri-specta` |
| Frontend | React 18, TypeScript (strict), Vite, Tailwind CSS, shadcn/ui, TanStack Query/Router, Zustand |
| Lists | TanStack Virtual for big libraries |
| Testing | `cargo test`, `wiremock`, Vitest, Playwright |
| Tooling | pnpm, rustfmt, clippy, ESLint, Prettier, GitHub Actions |

## 8. Extension points

- **New platform:** implement `AchievementProvider`, register in `providers/src/lib.rs`, add a connect UI under `features/accounts/`. Checklist in `.claude/skills/add-provider`.
- **New emulator (file-based):** implement the provider with `watch()`, plus a path auto-detector. See `.claude/skills/add-emulator-adapter`.
- **New notification style:** overlay is a plain React component under `src/overlay/`, so themes are CSS/React only.
