# Achievement Tracker

A lightweight desktop app that tracks your achievements and trophies across **PlayStation, Xbox, Steam, Epic Games, Ubisoft Connect, EA** and **emulators** in one place. It runs quietly in the system tray and pops up a notification the moment you unlock something, whichever platform it came from.

> **Status:** Pre-alpha. The project scaffold, docs and UI mockups are in place, and the tray icon and click-through unlock toast work; features start at [roadmap](docs/ROADMAP.md) milestone M1.

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

**C# on .NET 10** with **Avalonia** for the UI, SQLite for storage. One language for the whole app. Rationale: [ADR-0002](docs/adr/0002-csharp-dotnet-avalonia.md) (which superseded a Tauri/Rust plan, [ADR-0001](docs/adr/0001-tech-stack.md)).

## Documentation

| Doc | Purpose |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Product vision, users, UX, notification design |
| [docs/design/](docs/design/README.md) | UI mockups for the core screens (HTML snapshots + Superdesign canvas) |
| [docs/SPEC.md](docs/SPEC.md) | Requirements, data model, provider interface, services |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, folder structure |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Per-platform integration notes and risks |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and task breakdown |
| [docs/SCAFFOLD-GUIDE.md](docs/SCAFFOLD-GUIDE.md) | What's in the scaffold, how to run it, and a C# primer |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [CLAUDE.md](CLAUDE.md) | Guide for Claude Code working in this repo |

## Getting started

Prerequisites: the [.NET 10 SDK](https://dotnet.microsoft.com/download) (Windows 10/11; macOS and Linux should work for everything except the Windows-only overlay styles and credential store).

```bash
dotnet build
dotnet test
dotnet run --project src/AchievementTracker.App   # tray icon + main window; tray menu > Send test notification
```

## Contributing

Adding a platform or emulator? Follow the checklist in [`.claude/skills/add-provider`](.claude/skills/add-provider/SKILL.md) or [`add-emulator-adapter`](.claude/skills/add-emulator-adapter/SKILL.md). Significant decisions get an ADR (see [`write-adr`](.claude/skills/write-adr/SKILL.md)).

## Legal and safety notes

- Platform integrations that use unofficial APIs (PSN, Xbox, Epic, Ubisoft, EA) may break without notice and may conflict with the platform's terms of service. They are opt-in and clearly labelled.
- The app **never** injects into or modifies game processes, so it is safe with anti-cheat systems.
- This project is not affiliated with or endorsed by Sony, Microsoft, Valve, Epic, Ubisoft or EA.

## License

TBD (see [ROADMAP](docs/ROADMAP.md), open decisions).
