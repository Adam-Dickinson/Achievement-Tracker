# ADR-0019: Detecting exclusive full-screen with koffi

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

The unlock toast is an always-on-top window. A game in true exclusive full-screen draws above every window, so the toast is never seen (DESIGN §6, a risk in the roadmap). The planned mitigation is a Windows notification instead of the toast while such a game runs. That needs to know when one is running, without touching the game (rule 4). The design is in `docs/superpowers/specs/2026-10-23-fullscreen-fallback-design.md`.

Windows answers this itself: `SHQueryUserNotificationState` (shell32) reports `QUNS_RUNNING_D3D_FULL_SCREEN` while an exclusive full-screen Direct3D app runs. It is the state Windows uses to hold back its own notifications, and it reads nothing from the game. Electron and Node have no API for it.

## Options considered

| Option | Result |
|---|---|
| Compare the foreground window with the monitor bounds | Also needs a native call, and cannot tell borderless (toast visible) from exclusive (toast hidden) |
| Read the game's process or its window | Breaks rule 4 |
| PowerShell with `Add-Type` per check | No dependency, but about a second and tens of MB per call, at the moment a toast should appear |
| A small native addon of our own | Needs a C++ toolchain on every machine that installs, and rebuilding for each Electron |
| **koffi (MIT), calling `shell32.dll` directly** | Prebuilt binaries for Node-API (no compiler, works across Electron versions), a microsecond call, 1.1 MB on Windows |

## Decision

- **koffi 3.3.2** is a production dependency, pinned exactly. It is used only in `src/main/fullscreen.ts`, which loads `shell32.dll` once and declares the one function. No other file calls native code.
- **Checked only when a toast is about to show**, never on a timer, so there is no idle cost (N-02).
- **Only `QUNS_RUNNING_D3D_FULL_SCREEN` falls back** to a Windows notification, and only with the Settings switch on. Every other state, including "busy" (a borderless full-screen app, where the toast still shows), keeps the toast.
- **Failure is harmless:** if koffi or the call fails, the state is `unknown` and toasts work as before; the failure is logged once.

## Consequences

**Positive:**

- The fallback switches only when Windows itself says the game is exclusive full-screen.
- One small, isolated native dependency with a pure, tested mapping around it.

**Negative:**

- A native binary in the app: it must be unpacked from the asar archive, and a new Electron major version must still load it (Node-API keeps that stable).
- While an exclusive full-screen game runs, Windows may hold the fallback notification silently in Notification Center rather than show it; the unlock is still in Activity either way.
- Not yet checked with a real game; the owner checks it by hand.
