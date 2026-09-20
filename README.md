# Achievement Tracker

A lightweight desktop app that tracks your achievements and trophies across **PlayStation, Xbox, Steam, Epic Games, Ubisoft Connect, EA** and **emulators** in one place. It runs quietly in the system tray and pops up a notification the moment you unlock something, whichever platform it came from.

> **Status:** Pre-alpha. Project scaffold, docs and UI mockups are in place; features start at [roadmap](docs/ROADMAP.md) milestone M1.

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
| PlayStation | PSN trophy API (unofficial) | Polling | Medium |
| RetroAchievements (RetroArch, PPSSPP, DuckStation, Dolphin, PCSX2) | RA Web API | Polling | High |
| RPCS3 (PS3) | Local trophy files | Yes | Medium |
| Xenia (Xbox 360) | Local files | Yes | Low, needs spike |
| Epic Games | Research needed | n/a | Low |
| Ubisoft Connect | Research needed | n/a | Low |
| EA app | Research needed | n/a | Very low |

Details and risks for each: [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Tech stack

**Tauri 2** desktop shell, **Rust** backend (sync engine, providers, SQLite), **React + TypeScript** frontend. Rationale: [ADR-0001](docs/adr/0001-tech-stack.md).

## Documentation

| Doc | Purpose |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Product vision, users, UX, notification design |
| [docs/design/](docs/design/README.md) | UI mockups for the core screens (HTML snapshots + Superdesign canvas) |
| [docs/SPEC.md](docs/SPEC.md) | Requirements, data model, provider interface, IPC contract |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, folder structure |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Per-platform integration notes and risks |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and task breakdown |
| [docs/SCAFFOLD-GUIDE.md](docs/SCAFFOLD-GUIDE.md) | What's in the scaffold, plus a Rust primer for newcomers |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [CLAUDE.md](CLAUDE.md) | Guide for Claude Code working in this repo |

## Getting started

Prerequisites: [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 20+, [pnpm](https://pnpm.io) 9, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (on Windows: WebView2 and MSVC build tools).

```bash
pnpm install
pnpm tauri dev        # run the app with hot reload
pnpm tauri build      # produce an installer
cargo test --workspace
pnpm test
```

## Contributing

Adding a platform or emulator? Follow the checklist in [`.claude/skills/add-provider`](.claude/skills/add-provider/SKILL.md) or [`add-emulator-adapter`](.claude/skills/add-emulator-adapter/SKILL.md). Significant decisions get an ADR (see [`write-adr`](.claude/skills/write-adr/SKILL.md)).

## Legal and safety notes

- Platform integrations that use unofficial APIs (PSN, Xbox, Epic, Ubisoft, EA) may break without notice and may conflict with the platform's terms of service. They are opt-in and clearly labelled.
- The app **never** injects into or modifies game processes, so it is safe with anti-cheat systems.
- This project is not affiliated with or endorsed by Sony, Microsoft, Valve, Epic, Ubisoft or EA.

## License

TBD (see [ROADMAP](docs/ROADMAP.md), open decisions).
