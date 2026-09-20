# Architecture

Stack: C# on .NET 10 with Avalonia. Decision and alternatives: [ADR-0002](adr/0002-csharp-dotnet-avalonia.md).

## 1. System overview

```
┌──────────────────────────── AchievementTracker.exe (one process) ────────────────────────────┐
│                                                                                              │
│  ┌──────────────── Core services ────────────────┐      ┌──────────── Avalonia UI ─────────┐ │
│  │                                               │      │                                  │ │
│  │  Providers ──► Sync engine ──► Store          │      │  MainWindow (Dashboard, Library, │ │
│  │  (steam, xbox, psn, ra,        (SQLite)       │      │   Activity, Accounts, Settings)  │ │
│  │   rpcs3, ...)      │                          │ VMs  │                                  │ │
│  │      ▲             ▼                          │◄────►│  OverlayWindow (transparent,     │ │
│  │  Watchers     UnlockEvent                     │      │   click-through, topmost)        │ │
│  │  (FileSystemWatcher)  │                       │      │   └─ ToastView                   │ │
│  │      ▲                ▼                       │      │                                  │ │
│  │  Game detector   Notification service ────────┼─────►│  Tray icon + menu                │ │
│  │  (Process list)  (queue, DND, sound)          │      └──────────────────────────────────┘ │
│  └───────────────────────────────────────────────┘                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
      │ HTTPS                       │ file system                │ Windows Credential Manager
      ▼                             ▼                            ▼
Steam / Xbox / PSN / RA APIs   RPCS3 / Xenia / Steam files   Tokens & API keys
```

It is a **single process**. Closing the main window only hides it (`ShutdownMode.OnExplicitShutdown`); the tray icon, watchers, sync tasks and overlay keep running. "Quit" in the tray menu is the only way to exit.

## 2. Projects

| Project | Responsibility | Depends on |
|---|---|---|
| `AchievementTracker.Core` | Domain records (`RemoteGame`, `UnlockEvent`...), `Platform`, `Rarity`, `IAchievementProvider`, `ProviderException`, `Secret`, `ISecretStore` | nothing |
| `AchievementTracker.Store` | SQLite access, embedded SQL migrations, `MigrationRunner`. **The only place SQL lives.** | Core |
| `AchievementTracker.Providers` | One namespace per platform/emulator implementing `IAchievementProvider` | Core |
| `AchievementTracker.Sync` | Scheduler, diff engine (baseline rule), backoff, game detector, unlock events | Core, Store, Providers |
| `AchievementTracker.App` | Avalonia shell: windows, view-models, tray, overlay, notification service | all of the above |
| `AchievementTracker.Tests` | xUnit tests for everything except UI | all of the above |

### Dependency rule
`Core` ← `Store`, `Providers` ← `Sync` ← `App`. `Core` depends on nothing internal. Providers never touch the store, and views never talk to providers directly (they go through view-models and services).

## 3. Key data flows

### Unlock detection (polling provider)
1. The scheduler fires for `(account, scope)`
2. The provider fetches remote state; the sync engine diffs it against the store
3. New unlocks are inserted in one transaction; **after commit** an `UnlockEvent` is published
4. The notification service applies DND/settings and shows the toast on the overlay window
5. The same event updates the main window's view-models (marshalled to the UI thread)

### Unlock detection (local watcher, e.g. RPCS3)
A `FileSystemWatcher` notices a change, debounces (200-500 ms), and the provider signals `onChange(gameRef)`. The sync engine re-fetches and diffs exactly as above (steps 2-5). Watchers never emit unlocks themselves.

### Auth (OAuth-style, e.g. Xbox)
The Accounts view-model asks the service to begin the flow; the app opens the system browser (loopback redirect) or a short-lived auth window, exchanges tokens in the service layer, stores secrets in the credential store, creates the account row and disposes the flow. Tokens never reach views.

## 4. Concurrency model

- `async`/`await` end to end; **one supervised long-running task per (account, provider)** so failures are isolated (N-10)
- `System.Threading.Channels` between sync and the notification service: bounded, so a slow UI never blocks sync
- SQLite in WAL mode; one writer at a time, reads concurrent
- `CancellationToken` on every provider call; cancelled on disconnect and on quit
- UI updates go through `Dispatcher.UIThread`; view-models never block it

## 5. Overlay window details

- One `OverlayWindow`, created lazily on first toast and then reused (hidden between toasts)
- Avalonia properties: `WindowDecorations="None"`, `Background="Transparent"`, `TransparencyLevelHint="Transparent"`, `Topmost`, `ShowInTaskbar="False"`, `ShowActivated="False"`, `CanResize="False"`
- `WindowsOverlayStyles.Apply(hwnd)` adds `WS_EX_TRANSPARENT` (click-through), `WS_EX_NOACTIVATE` (never takes focus) and `WS_EX_TOOLWINDOW` (hidden from Alt+Tab) via `SetWindowLongPtr`. It only touches our own window.
- `OverlayService` positions the window in the bottom-right of the primary monitor's **working area**, using pixel coordinates scaled by the monitor's DPI factor. Corner and monitor selection are settings (M4).
- A `DispatcherTimer` hides the window after the configured duration
- Exclusive-fullscreen games render above normal windows, so a fallback native Windows toast is planned (DESIGN §6)
- The toast (`ToastView`) picks its accent colour with style classes (`uncommon`, `rare`, `ultra`) driven by view-model flags; each class redefines one `ToastAccent` resource

## 6. Folder structure

```
achievement-tracker/
├── AchievementTracker.sln
├── Directory.Build.props            # shared: net10.0, nullable, warnings as errors, analyzers
├── .editorconfig                    # formatting + naming rules (enforced in build)
├── .claude/skills/                  # project skills for Claude Code
│   ├── add-provider/SKILL.md
│   ├── add-emulator-adapter/SKILL.md
│   ├── db-migration/SKILL.md
│   └── write-adr/SKILL.md
├── .github/workflows/ci.yml         # restore, format check, build, test
├── .superdesign/design-system.md    # design tokens/spec used for mockups
├── docs/
│   ├── DESIGN.md  SPEC.md  ARCHITECTURE.md  PROVIDERS.md  ROADMAP.md  SCAFFOLD-GUIDE.md
│   ├── adr/                         # architecture decision records
│   └── design/                      # README + mockups/*.html
├── src/
│   ├── AchievementTracker.Core/
│   │   ├── Platform.cs  Rarity.cs  Secret.cs  Models.cs
│   │   ├── IAchievementProvider.cs  ProviderException.cs  ISecretStore.cs
│   ├── AchievementTracker.Store/
│   │   ├── Migrations/0001_init.sql          # embedded resources, forward-only
│   │   └── Migrations.cs  MigrationRunner.cs
│   ├── AchievementTracker.Providers/
│   │   ├── Steam/  Xbox/  PlayStation/  RetroAchievements/  Rpcs3/
│   │   └── Xenia/  Epic/  Ubisoft/  Ea/  LocalFile/          # stubs for now
│   ├── AchievementTracker.Sync/
│   │   └── Backoff.cs                        # + Scheduler, Diff, GameDetector in M1/M2
│   └── AchievementTracker.App/
│       ├── Program.cs  App.axaml(.cs)        # startup, tray icon, lifetime
│       ├── Themes/Tokens.axaml               # design tokens (colours, radii, shadows, glyphs)
│       ├── Assets/                           # app icon
│       ├── Views/                            # MainWindow, OverlayWindow, ToastView
│       ├── ViewModels/                       # MainWindowViewModel, ToastViewModel, NavItem
│       └── Services/                         # OverlayService, WindowsOverlayStyles
└── tests/
    ├── AchievementTracker.Tests/             # xUnit
    └── fixtures/                             # sanitized provider responses / sample trophy files
```

Planned additions: `src/AchievementTracker.App/Views/{Dashboard,Library,GameDetail,Activity,Accounts,Settings,Onboarding}` with matching view-models, mirroring the mockups in `docs/design/mockups/`.

## 7. Technology summary

| Concern | Choice |
|---|---|
| Runtime / language | .NET 10 (LTS), C# (latest), nullable enabled, warnings as errors |
| UI | Avalonia 12 (XAML, compiled bindings), Fluent theme, Inter font |
| MVVM | CommunityToolkit.Mvvm (`[ObservableProperty]`, `[RelayCommand]`) |
| DB | SQLite via `Microsoft.Data.Sqlite`; plain SQL migrations (add Dapper if row mapping gets tedious) |
| Secrets | Windows Credential Manager behind `ISecretStore` (M1) |
| HTTP | `HttpClient` via `IHttpClientFactory` (M1) |
| File watching | `FileSystemWatcher` + debounce |
| Process detection | `System.Diagnostics.Process` |
| Binary parsing | `BinaryPrimitives` / `Span<byte>` for trophy files |
| Logging | `Microsoft.Extensions.Logging` |
| Testing | xUnit; stubbed `HttpMessageHandler`; Avalonia headless for UI |
| Tooling | `dotnet format`, built-in analyzers, GitHub Actions |

## 8. Extension points

- **New platform:** implement `IAchievementProvider`, register it, add a connect view under `Views/Accounts`. Checklist: `.claude/skills/add-provider`.
- **New emulator (file-based):** implement the provider with `Watch()` plus a path auto-detector. See `.claude/skills/add-emulator-adapter`.
- **New notification style:** the toast is an ordinary Avalonia `UserControl` (`ToastView`), so themes are XAML styles only.
