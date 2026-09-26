# Trophy Locker

A lightweight desktop app that tracks your achievements and trophies across **PlayStation, Xbox, Steam, Epic Games, Ubisoft Connect** and **EA** in one place, with emulators planned after v1. It runs quietly in the system tray and pops up a notification the moment you unlock something, whichever platform it came from.

> **Status:** Pre-alpha. The project scaffold, docs and UI mockups are in place, and the tray icon and animated, click-through unlock toast work; features start at [roadmap](docs/ROADMAP.md) milestone M1.

## Goals

- One unified library and progress view across every platform you play on
- Real-time unlock notifications (custom in-game-style toast with rarity and sound)
- Tiny background footprint: always on, barely noticeable
- Local-first: your data lives in a local SQLite database, credentials in the OS keychain
- Extensible: adding a platform or emulator is one self-contained adapter

## Supported sources (planned)

| Source | Method | Real-time | Confidence |
|---|---|---|---|
| Steam | Web API + local stats files | Yes | High |
| Xbox | Xbox Live API | Polling | Medium |
| PlayStation | PlayStation App services (unofficial), signed in on Sony's page in an app window (again every 2 months) | Polling, after the console syncs | Medium-Low |
| Epic Games | Epic launcher services (unofficial), signed in with a code from the browser | Polling | Medium |
| Ubisoft Connect | Ubisoft Connect launcher services (unofficial), signed in on Ubisoft's page in an app window | Polling | Medium-Low |
| EA app | EA app services (unofficial), signed in on EA's page in an app window | Polling | Medium-Low |

After v1: RetroAchievements (RetroArch, PPSSPP, DuckStation, Dolphin, PCSX2), RPCS3 (PS3) and Xenia (Xbox 360).

Details and risks for each: [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Tech stack

**Electron** (Node.js main process) with a **React + TypeScript** UI, styled with Tailwind CSS and animated with Motion; SQLite (Node's built-in `node:sqlite`) for storage. One language (TypeScript) for the whole app. Rationale: [ADR-0003](docs/adr/0003-electron-typescript-react.md) (which superseded earlier C# and Tauri plans: [ADR-0002](docs/adr/0002-csharp-dotnet-avalonia.md), [ADR-0001](docs/adr/0001-tech-stack.md)).

## Documentation

| Doc | Purpose |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Product vision, users, UX, notification design |
| [docs/design/](docs/design/README.md) | UI mockups for the core screens (HTML snapshots + Superdesign canvas) |
| [docs/SPEC.md](docs/SPEC.md) | Requirements, data model, provider interface, services |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, folder structure |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Per-platform integration notes and risks |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and task breakdown |
| [docs/PROJECT-MAP.md](docs/PROJECT-MAP.md) | Where everything is: every folder and file, how they connect, and where to work for each kind of change |
| [docs/SCAFFOLD-GUIDE.md](docs/SCAFFOLD-GUIDE.md) | What's in the scaffold, how to run it, and a React + Electron primer |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [CLAUDE.md](CLAUDE.md) | Guide for Claude Code working in this repo |

## Getting started

Prerequisites: [Node.js](https://nodejs.org) 24 LTS (22.22+ also works; odd-numbered releases such as 25 work but print engine warnings from test dependencies). npm comes with Node. Windows is the primary target.

```bash
npm install       # also downloads Electron's binary (~100 MB, first time only)
npm run dev          # run the app with hot reload (tray icon + main window)
npm test         # unit and component tests
npm run lint && npm run typecheck
npm run build        # production build into ./out (run it with: npm start)
```

In the app, use the **Send test notification** button (or the tray menu) to see an unlock toast.

> If the app fails to start with `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`, the environment variable `ELECTRON_RUN_AS_NODE` is set (VS Code's extension host sets it). Unset it: `Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell.

## Contributing

Adding a platform or emulator? Read [docs/PROVIDERS.md](docs/PROVIDERS.md) for what's known about each platform and [docs/SPEC.md](docs/SPEC.md) §4 for the provider interface, then implement `AchievementProvider` in `src/main/providers`. Significant decisions get an ADR in [docs/adr/](docs/adr/) (use ADR-0003 as the template).

## Legal and safety notes

- Platform integrations that use unofficial APIs (PSN, Xbox, Epic, Ubisoft, EA) may break without notice and may conflict with the platform's terms of service. They are opt-in and clearly labelled.
- The app **never** injects into or modifies game processes, so it is safe with anti-cheat systems.
- This project is not affiliated with or endorsed by Sony, Microsoft, Valve, Epic, Ubisoft or EA.

## License

Licensed under the [GNU General Public License v3.0](LICENSE) (`GPL-3.0-only`).
