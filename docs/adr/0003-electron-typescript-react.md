# ADR-0003: Electron, TypeScript and React

- **Status:** Accepted
- **Date:** 2026-09-20
- **Supersedes:** [ADR-0002](0002-csharp-dotnet-avalonia.md) (which superseded [ADR-0001](0001-tech-stack.md))

## Context

ADR-0002 chose C# with Avalonia. The scaffold worked, but the project owner decided the UI should be built with web technology, for these reasons:

- **Presentation matters most.** Web tech gives the richest visual toolbox: CSS animation and effects, a huge component and animation ecosystem, fast hot-reload iteration, and design tools (including the Superdesign mockups already produced) output HTML natively.
- The owner wants to **learn React**.
- One language (TypeScript) for the whole app.

Requirements are unchanged: an always-on background app that watches files, polls platform APIs, shows click-through unlock toasts, and stores data locally with credentials kept safe.

## Options considered

| Option | Languages | Idle memory (measured/est.) | Notes |
|---|---|---|---|
| **Electron + TypeScript + React** | TS only | ~170 MB private (measured) | Bundles Chromium, so rendering is identical everywhere; tray, transparent windows, native toasts built in |
| Tauri + React | Rust + TS | ~30-80 MB | Lightest, but requires Rust (rejected in ADR-0002's context) |
| .NET backend + WebView2 UI | C# + TS | ~80-150 MB | Keeps C#, but two toolchains and an IPC layer |
| Avalonia (status quo, ADR-0002) | C# | ~170 MB debug | Working, but the polish ceiling and iteration speed are lower than web |

Frontend framework: **React** (largest ecosystem, best animation and component libraries, most natural target for design tools). Vue or Angular remain possible later: only `src/renderer` would change.

## Decision

**Electron 44, TypeScript (strict), React 19**, built with **electron-vite** (Vite 7), styled with **Tailwind CSS 4**, animated with **Motion**, icons from **lucide-react**, fonts Inter and Space Grotesk bundled locally.

- **Three code areas** under `src/`: `main` (Node: windows, tray, database, providers, sync), `preload` (a tiny sandboxed bridge), `renderer` (React UI), plus `shared` (domain types and the IPC contract, imported by all three).
- **Security defaults:** `contextIsolation`, `sandbox`, no Node integration, a strict CSP in production builds, IPC sender validation, navigation and new-window blocking. The UI only reaches the main process through `window.api`.
- **Database:** Node's built-in **`node:sqlite`** (available in Electron 44's Node 24), so there is no native module to rebuild. Plain-SQL forward-only migrations (`src/main/store/migrations/`) tracked by `PRAGMA user_version`, behind a small `SqlDatabase` interface.
- **Secrets:** behind a `SecretStore` interface; production will use Electron `safeStorage` (Windows DPAPI) in M1. `Secret` redacts itself in strings, JSON and `console.log`.
- **Overlay:** a transparent, frameless, always-on-top, `focusable: false`, click-through (`setIgnoreMouseEvents`) window, created hidden at startup. Verified on Windows to carry `WS_EX_TRANSPARENT` and `WS_EX_NOACTIVATE`.
- **Close-to-tray:** closing the main window *destroys* it (freeing its renderer, about 90 MB); the tray icon keeps the app alive and recreates the window on demand.
- **Tooling:** pnpm 9, Vitest (Node tests for main/shared; jsdom + Testing Library for UI), ESLint (typescript-eslint, react-hooks) with zero warnings allowed, Prettier, TypeScript 6.0.

## Consequences

**Positive:** one language; the best UI and animation tooling; hot reload; the design mockups translate directly; large ecosystem for the platform APIs (PSN, Xbox, Steam libraries in npm).

**Negative / to watch:**
- **Memory:** measured on a production build, idle in the tray: ~320 MB working set, ~170 MB private, 4 processes (main, GPU, network, overlay renderer). SPEC N-02 has been revised accordingly. Further options: create the overlay window on demand, disable GPU acceleration, trim main-process dependencies.
- **Installer size:** roughly 80-120 MB (Chromium). SPEC N-05 revised.
- **`node:sqlite` is still flagged experimental in Node.** It works and is tested here, but the API could change; the `SqlDatabase` interface confines the impact. `better-sqlite3` is the fallback (needs an Electron rebuild step).
- **Version pins:** Vite is pinned to 7 (electron-vite 5 doesn't support 8 yet) and TypeScript to 6.0 (typescript-eslint doesn't support 7 yet). Revisit on upgrades.
- **Gotcha:** if the environment variable `ELECTRON_RUN_AS_NODE` is set (VS Code's extension host sets it), Electron runs as plain Node and the app fails with `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`. Unset it when launching from such a shell.
- **package.json must not set `"type": "module"`:** the main and preload bundles must be CommonJS (sandboxed preload scripts cannot be ES modules).
- Two "worlds" (main process and renderer) with an IPC boundary: more to learn, but the contract lives in one file (`src/shared/ipc.ts`).

## Revisit if

- Memory turns out to matter more than presentation: move the shell to Tauri, keeping `src/renderer` (React) and `src/shared` unchanged and porting `src/main` to Rust
- React proves a poor fit for the owner: swap `src/renderer` for Vue or Angular; `main`, `preload` and `shared` are framework-independent
