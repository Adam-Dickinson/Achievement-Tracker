# ADR-0002: C# / .NET with Avalonia

- **Status:** Accepted
- **Date:** 2026-09-20
- **Supersedes:** [ADR-0001](0001-tech-stack.md)

## Context

ADR-0001 chose Tauri (Rust backend, React UI). Before any feature work began, the project owner decided to use C# instead, for these reasons:

- No prior Rust experience: the learning curve would slow early milestones
- The hardest work is platform integration (unofficial PSN/Xbox auth, file formats), where a language that is quick to iterate in matters more than the last few MB of RAM
- Best-in-class Windows integration (tray, toasts, autostart, process detection) is the priority, since Windows is the first target
- One language for the whole app, with one toolchain

Requirements are unchanged: an always-on background app with a small footprint that watches files, polls web APIs, shows click-through unlock toasts, and stores data locally with credentials kept safe.

## Options considered (for the UI, given C#)

| Option | Cross-platform | Notes |
|---|---|---|
| **Avalonia** | Windows, macOS, Linux | XAML + MVVM, custom styling suits the design system, built-in tray icon, transparent windows |
| WPF | Windows only | Most mature, best tooling; locks us to Windows |
| WinUI 3 | Windows only | Modern look, but packaging is heavier and tooling rougher |
| .NET backend + WebView2 (React UI kept) | Windows | Keeps the React work but reintroduces two languages and an IPC layer |

## Decision

**C# on .NET 10 (LTS) with Avalonia for the UI.**

- **Solution layout:** `Core` (domain, provider interface), `Store` (SQLite), `Providers`, `Sync`, and `App` (Avalonia shell), plus an xUnit test project. Same dependency rule as before: `Core` ← `Store`, `Providers` ← `Sync` ← `App`.
- **UI pattern:** MVVM with CommunityToolkit.Mvvm; compiled bindings enabled.
- **Storage:** SQLite via `Microsoft.Data.Sqlite` with forward-only SQL migrations embedded in the `Store` assembly, tracked by `PRAGMA user_version`.
- **Secrets:** behind `ISecretStore`. The production implementation will use the Windows Credential Manager (M1).
- **Overlay:** an Avalonia transparent, topmost window. Windows-specific extended styles (`WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`) make it click-through and non-activating.
- **Quality gates:** nullable reference types, warnings as errors, recommended analyzers, `dotnet format` in CI.
- **Design system:** the tokens live in `Themes/Tokens.axaml` and mirror the design system used to generate the mockups. The HTML mockups in `docs/design/mockups/` remain the visual reference.

## Consequences

**Positive:** one language, easy to learn coming from TypeScript, strong tooling and libraries (SQLite, HTTP, JSON built in), quick iteration, strong Windows APIs.

**Negative / to watch:**
- Higher idle memory than a Rust/Tauri app. A debug build measured about 174 MB working set with the main window open; a release build with the window closed must be measured against the target in SPEC N-02 (< 100 MB) and tuned if needed (trimming, ReadyToRun, closing the main window's visual tree when hidden).
- The React UI and Tailwind tokens were discarded; the mockups now have to be rebuilt as XAML.
- Avalonia's ecosystem is smaller than WPF's, and Space Grotesk (the display font) is not yet bundled, so Inter is used everywhere for now.
- Requires the .NET runtime, or a self-contained publish (larger installer).

## Revisit if

- The memory target can't be met after tuning: consider a lighter tray-only host process with a separate on-demand UI process
- Windows-only becomes the firm scope and WPF's maturity outweighs cross-platform: the view-models and all non-UI projects carry over unchanged
