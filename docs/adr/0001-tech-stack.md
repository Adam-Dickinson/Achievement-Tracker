# ADR-0001: Tech stack (Tauri + Rust)

> Historical record. The project moved to C# / .NET in ADR-0002 before any feature work started. Kept for the comparison of options.

- **Status:** Superseded by [ADR-0002](0002-csharp-dotnet-avalonia.md)
- **Date:** 2026-09-20

## Context

We need a desktop app that:

1. Runs permanently in the background (tray) with minimal RAM/CPU
2. Watches local files and polls several web APIs
3. Shows unlock pop-ups on top of games
4. Stores data locally and keeps credentials secure
5. Starts on Windows (where all target platforms and emulators overlap), with macOS/Linux possible later

## Options considered

| Option | Idle RAM | Windows integration | Cross-platform | Dev speed | Notes |
|---|---|---|---|---|---|
| **Tauri 2 (Rust + web UI)** | ~30-80 MB | Good (plugins + `windows` crate) | Win/macOS/Linux | Medium | Small binary, native tray, multi-window, autostart, updater |
| Electron (Node/TS) | ~150-300 MB | Good | Win/macOS/Linux | High | One language, but heavy for an always-on app |
| .NET 8 + WinUI/WPF | ~50-100 MB | Excellent | Windows only | High on Windows | Great toasts/tray; locks us to Windows |
| .NET + Avalonia | ~60-120 MB | Good | Win/macOS/Linux | Medium | Viable; smaller ecosystem for web-style UI |
| Go + Wails | ~40-80 MB | Good | Win/macOS/Linux | Medium | Simpler than Rust; weaker binary parsing/typing ergonomics |

## Decision

**Tauri 2 with a Rust backend and a React + TypeScript frontend.**

### Backend: Rust

- Lowest idle footprint for something that runs all day
- Strong async (`tokio`), file watching (`notify`), HTTP (`reqwest`), binary parsing (`nom`/`binrw`) for trophy and Steam stats files
- The `AchievementProvider` trait plus enums model platform variance safely, and the compiler catches missing cases when a provider is added
- Native Tauri access to tray, autostart, single-instance, updater, secondary windows

### Frontend: TypeScript + React

- Largest UI ecosystem, and the best fit for design-tool output (Superdesign / Figma to React + Tailwind)
- Vite, Tailwind CSS, shadcn/ui, TanStack Query (server-state from Rust commands), Zustand (UI state)
- **Type-safe IPC:** `tauri-specta` generates TypeScript types and command bindings from Rust, so the contract can't drift

### Storage

- **SQLite** via `sqlx` (compile-time-checked queries, migrations), single file in the app data dir
- **Credentials/tokens** in the OS keychain (`keyring` crate; Windows Credential Manager). Never in SQLite or plaintext config.

## Consequences

**Positive:** small, fast, always-on-friendly; strong typing end to end; cross-platform door left open.

**Negative:**
- Rust learning curve and slower compile times
- Two toolchains (cargo + pnpm)
- WebView2 dependency on Windows (bundled/bootstrapped by the installer)
- Overlay pop-ups cannot render over **exclusive-fullscreen** games (see DESIGN.md, fallback to native toast)

## Revisit if

- Rust velocity blocks progress: fall back to Electron for the shell but keep the provider crates as a sidecar binary
- We decide to be Windows-only and want richer native UI: reconsider .NET
