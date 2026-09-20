# Scaffold Guide: what's here, and a C# primer

Explains what was built, how the pieces connect, how to run it, and the C# ideas you will meet when reading the code. Read it once, then use it as a reference.

> **Status:** everything here has been built and checked. `dotnet build` passes with zero warnings (warnings are errors), 30 tests pass, and the app was launched and used: main window, tray icon, and a click-through toast that appears bottom-right and hides after 5 seconds.

---

## 1. The big picture

One .NET process does everything: it draws the windows, syncs with the platforms, stores data and shows the toast.

```
Providers (Steam, Xbox, PSN, ...)  ──►  Sync engine  ──►  Store (SQLite)
  fetch achievements                   spot new unlocks       remember everything
                                            │
                                            ▼
                                     UnlockEvent ──► Notification service ──► Overlay window (toast)
                                            └──────► Main window (view-models)
```

- **Avalonia** is the UI framework: you describe windows in XAML (`.axaml`) and bind them to C# view-models. Think "WPF that also runs on macOS and Linux."
- **MVVM**: the *View* (XAML) shows data, the *ViewModel* (C#) holds state and commands, the *Model* is the domain (`Core`). Views contain almost no logic.
- Decision and reasoning: [ADR-0002](adr/0002-csharp-dotnet-avalonia.md).

## 2. What was created

| Area | What | State |
|---|---|---|
| Docs | Design, spec, architecture, providers, roadmap, ADRs, this guide | Complete drafts |
| Mockups | 7 screens in `docs/design/mockups/` | Reference only |
| Claude skills | `.claude/skills/*` recipes for recurring tasks | Ready to use |
| `Core` | Platform, Rarity, Secret, models, provider interface, errors | Real, tested |
| `Store` | SQLite schema + migration runner | Real, tested (applies the schema to a real in-memory database) |
| `Providers` | One stub per platform | Stubs |
| `Sync` | Backoff calculation | One small real piece |
| `App` | Main window shell, tray icon, overlay toast | Working, placeholder content |
| CI | `.github/workflows/ci.yml` | Written, not yet run on GitHub (same commands pass locally) |

The main window is a placeholder (sidebar + "Scaffold ready"). The mockups in `docs/design/mockups/` are what it should become, milestone by milestone ([roadmap](ROADMAP.md)).

## 3. The solution, project by project

- `AchievementTracker.sln` groups the projects. `dotnet build` and `dotnet test` at the repo root act on all of them.
- Each `.csproj` describes one project (its dependencies, packages, settings). `Directory.Build.props` at the root holds settings shared by all: .NET 10, nullable checks, **warnings as errors**, analyzers on.
- `.editorconfig` holds formatting and naming rules that the build enforces.

```
Core  ←  Store
  ↑   ←  Providers   ←  Sync  ←  App (the executable)
```

An arrow points at what is depended on. `Core` depends on nothing internal, so providers can never reach into the database, and so on ([ARCHITECTURE.md](ARCHITECTURE.md) §2).

### `src/AchievementTracker.Core`
| File | What it defines |
|---|---|
| `Platform.cs` | `enum Platform { Steam, Xbox, ... }` plus helper methods (`Id()`, `DisplayName()`, `IsUnofficial()`) |
| `Rarity.cs` | `enum Rarity` and `FromPercent()`: the rarity tiers from the design |
| `Secret.cs` | Wraps a token so it prints as `Secret(<redacted>)` and can't leak into logs |
| `Models.cs` | Data shapes returned by providers: `RemoteGame`, `RemoteAchievement`, `UnlockEvent`... |
| `ProviderException.cs` | The ways a platform call can fail (`AuthExpired`, `RateLimited`, `Network`...) |
| `IAchievementProvider.cs` | The interface every platform implements, plus `ProviderCapabilities` and `AuthInput` |
| `ISecretStore.cs` | Where tokens live, plus an in-memory version for tests |

### `src/AchievementTracker.Store`
`Migrations/0001_init.sql` is the full schema, embedded in the assembly. `Migrations.cs` loads the SQL files; `MigrationRunner.cs` applies the pending ones and records progress in SQLite's `user_version`.

### `src/AchievementTracker.Providers`
One folder per platform (`Steam/`, `Xbox/`, ...). Each has a comment saying what it will do. Real code arrives in M1+.

### `src/AchievementTracker.Sync`
`Backoff.cs` computes retry delays (5s, 10s, 20s... capped). The scheduler and diff logic arrive in M1.

### `src/AchievementTracker.App`
- `Program.cs` is the entry point and starts Avalonia (with the Inter font).
- `App.axaml` / `App.axaml.cs`: application resources, the tray icon and its menu, and lifetime rules (closing the window hides it; only "Quit" exits).
- `Themes/Tokens.axaml`: design tokens (colours, corner radii, shadows, the trophy glyph), matching `.superdesign/design-system.md`.
- `Views/`: `MainWindow`, `OverlayWindow` (the transparent toast host) and `ToastView` (the toast itself).
- `ViewModels/`: `MainWindowViewModel`, `ToastViewModel`, `NavItem`.
- `Services/OverlayService.cs`: shows a toast bottom-right for N seconds. `WindowsOverlayStyles.cs`: the few Windows calls that make the overlay click-through and non-focus-stealing.

### `tests/AchievementTracker.Tests`
xUnit tests. `dotnet test` runs them all.

## 4. C# concepts, using this codebase as the examples

You don't need to memorise these; skim, then look at the file when curious.

### Records: data with value semantics
`Models.cs` declares data shapes in one line each:

```csharp
public sealed record RemoteGame(RemoteGameRef Reference, string Title, string? IconUrl, DateTimeOffset? LastPlayed);
```

A `record` gives you a constructor, properties, equality by value, `ToString()` and `with` copies for free. Records are for data; classes are for things with behaviour.

### Nullable reference types: `string` vs `string?`
The project turns on nullable checks. `string Title` promises "never null"; `string? IconUrl` says "may be null". The compiler warns if you dereference a maybe-null value without checking, and warnings are errors here, so null bugs are caught at build time.

### `enum` and `switch` expressions
`Platform.cs` maps each enum member to text with a `switch` expression:

```csharp
public static string DisplayName(this Platform platform) => platform switch
{
    Platform.Steam => "Steam",
    Platform.Xbox => "Xbox",
    ...
    _ => throw new ArgumentOutOfRangeException(...),
};
```

Add a new `Platform` and the compiler flags every non-exhaustive `switch` in the code as an error, so you can't forget one.

### Extension methods
`public static string Id(this Platform platform)` lets you write `platform.Id()` as if it were a method on the enum. The `this` on the first parameter is what does that.

### Interfaces and default implementations
`IAchievementProvider` is the contract every platform meets. Its `Watch(...)` method has a body (`=> null`) so providers that don't watch files don't need to implement it. That's a *default interface method*.

### `async` / `await`, `Task`, `CancellationToken`
Methods that wait on the network return `Task<T>` and are named `...Async`. `await` pauses the method without blocking a thread. Every provider method takes a `CancellationToken` so a sync can be cancelled cleanly (on disconnect, or quit). Rules of thumb: never call `.Result` or `.Wait()`, and avoid `async void` except for UI event handlers.

### `IDisposable`: cleaning up
`Watch(...)` returns an `IDisposable`. Calling `Dispose()` (or a `using` block) stops the file watcher. Anything that holds a resource (files, timers, connections) implements it.

### Primary constructors
`public sealed class Secret(string value)` and `ToastViewModel(...)` take their constructor parameters right in the class declaration; the parameters are usable throughout the class body.

### Small language features you'll see everywhere
- `namespace X;` (file-scoped): the whole file is in that namespace
- `sealed`: this class can't be inherited (our default: it's simpler and faster)
- `var`: the compiler infers the type
- `[..]` collection expressions and `[]` empty collections
- `is`/`or` patterns: `platform is Platform.Xbox or Platform.PlayStation`
- `$"..."` string interpolation

### XAML, bindings and MVVM
In `MainWindow.axaml`:

```xml
<TextBlock Text="{Binding SelectedNav.Title}" />
<Button Content="Send test notification" Command="{Binding SendTestNotificationCommand}" />
```

`{Binding X}` connects a control to a property on the window's view-model (`x:DataType` names its type, so bindings are checked at compile time). When the property changes, the UI updates automatically.

### CommunityToolkit.Mvvm: less boilerplate
In `MainWindowViewModel.cs`:

```csharp
[ObservableProperty] private string _syncStatus = "Not synced yet";   // generates a SyncStatus property that notifies the UI
[RelayCommand] private void SendTestNotification() { ... }            // generates SendTestNotificationCommand
```

These attributes trigger **source generators** that write the missing code at build time. That is why the class is `partial`: the generated half lives alongside yours.

### Style classes and resources (how the toast changes colour)
`ToastView.axaml` gives its border the classes `uncommon`, `rare` or `ultra` depending on view-model flags. Each class redefines a single resource, `ToastAccent`, and the icon, title label and border all read that one resource, so one rule recolours the whole toast. Colours come from `Tokens.axaml`; don't hard-code them in views.

### Platform-specific code
`WindowsOverlayStyles.cs` calls Windows APIs (`user32.dll`) to add `WS_EX_TRANSPARENT` (click-through) and `WS_EX_NOACTIVATE` (never takes focus). It is guarded by `OperatingSystem.IsWindows()`, and it only changes the overlay's own window, never another process, which keeps it anti-cheat safe.

## 5. Command cheat sheet

| Command | Does |
|---|---|
| `dotnet build` | Compile everything (warnings are errors) |
| `dotnet test` | Run all tests |
| `dotnet test --filter "FullyQualifiedName~Migration"` | Run matching tests only |
| `dotnet format` | Fix formatting/style; add `--verify-no-changes` to only check |
| `dotnet run --project src/AchievementTracker.App` | Run the app |
| `dotnet watch --project src/AchievementTracker.App` | Rebuild and restart on change |
| `dotnet add <project> package <Name>` | Add a NuGet package |

## 6. Your first 30 minutes

1. `dotnet build` and `dotnet test`. Both should pass.
2. `dotnet run --project src/AchievementTracker.App`. The main window opens and a trophy icon appears in the tray. Click **Send test notification** (or use the tray menu) to see the toast; press it repeatedly to cycle through the four rarity tiers. Close the window: the app stays in the tray. Right-click the tray icon > **Quit** to exit.
3. **Break something on purpose.** In `Platform.cs`, add `Gog` to the `Platform` enum and run `dotnet build`. The compiler lists every `switch` that must handle it. Then undo it (`git restore .`).
4. Change the text in `MainWindowViewModel`'s `NavItems` and re-run to see it update.
5. Open `docs/design/mockups/dashboard.html` in a browser: that's what the Dashboard view should look like. The Dashboard is a good first screen to build in M1.

## 7. Known gaps and follow-ups

- **Memory:** the debug build showed ~174 MB with the main window open. The target is under 100 MB (SPEC N-02); measure a *release* build with the window hidden before tuning. ADR-0002 lists options.
- **Display font:** Space Grotesk (for big numbers) is not bundled yet; everything uses Inter.
- **Single instance, autostart, credential store, queueing/stacking of toasts:** planned for M1.
- **Overlay not yet verified over a real game** or across multiple monitors with different DPI (roadmap Spike A).
- CI has not run on GitHub yet.

## 8. Learning resources

- **C# documentation and tour:** https://learn.microsoft.com/dotnet/csharp/
- **Avalonia docs** (XAML, styles, bindings): https://docs.avaloniaui.net/
- **CommunityToolkit.Mvvm:** https://learn.microsoft.com/dotnet/communitytoolkit/mvvm/
- **async/await in C#:** https://learn.microsoft.com/dotnet/csharp/asynchronous-programming/
- **xUnit:** https://xunit.net/

## 9. Working with Claude on this project

- `CLAUDE.md` holds the project rules Claude follows; they're good rules for you too.
- Project skills in `.claude/skills/` automate recurring tasks: `add-provider`, `add-emulator-adapter`, `db-migration`, `write-adr`.

## 10. Glossary

| Term | Meaning |
|---|---|
| Solution / project | `.sln` groups `.csproj` projects; each project builds to one assembly |
| NuGet | .NET's package manager (like npm) |
| Record | A data type with value equality, defined in one line |
| Nullable reference types | Compiler checks that distinguish `string` from `string?` |
| MVVM | View (XAML) - ViewModel (state and commands) - Model (domain) |
| XAML / AXAML | The markup language used to describe UI |
| Source generator | Code that writes code at build time (used by CommunityToolkit.Mvvm) |
| Avalonia | Cross-platform XAML UI framework for .NET |
| Provider | An adapter for one platform (Steam, Xbox, ...) |
| Baseline | The first sync of a game, which stores existing unlocks silently |
