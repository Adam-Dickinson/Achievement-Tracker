# ADR-0006: v1 covers the launchers and consoles; emulators move after v1

- **Status:** Accepted
- **Date:** 2026-09-24

## Context

SPEC F-04 made RetroAchievements and RPCS3 P0 alongside Steam, and put Epic, Ubisoft and EA last (F-05, P2). The roadmap followed: M2 was "Emulators and Xbox", PlayStation came in M3, and Epic, Ubisoft and EA sat in M5 after the polish milestone.

With M1 done, the owner set the priorities: the PC launchers and consoles (Steam, Xbox, PlayStation, Epic, Ubisoft, EA) matter; emulators matter much less. Each provider is weeks of work, so the order decides what v1 is.

## Options considered

| Option | Result |
|---|---|
| Keep the order (RA and RPCS3 in M2) | Emulators arrive before the launchers the owner uses; Epic and Ubisoft wait until after polish |
| Keep emulators in v1 at a lower priority | v1 still carries them, so release waits on work the owner rates below every launcher |
| **Drop emulators from v1; launchers and consoles first** | v1 is Steam, Xbox, PlayStation, then Epic, Ubisoft and EA as far as their spikes allow |

## Decision

v1 covers Steam, Xbox, PlayStation, Epic, Ubisoft and EA. RetroAchievements, RPCS3, Xenia and the generic local-file adapter (F-06) move to a "After v1" list.

- **Order:** M2 is near real-time Steam, Xbox and the Activity feed. M3 is PlayStation and the unified library. M4 is Epic, Ubisoft and EA: the feasibility spike first, then a provider or a documented "not supported" for each. Polish moves to M5; release stays M6.
- **Priorities:** Steam, Xbox and PlayStation are P0. Epic, Ubisoft and EA are P1 and depend on their spikes. The emulators are after v1.
- Rule 5 still holds: Epic and Ubisoft have no public API, and a provider that needs the user's password is not an option. "Not supported" is an acceptable spike result; the Steam provider already covers their games that are also on Steam.

## Consequences

**Positive:**

- The providers the owner uses come first, and v1 does not wait on emulator work.
- Xbox and PlayStation arrive before cross-platform game matching (M3) needs a second and third source.

**Negative / to accept:**

- Epic, Ubisoft and EA may all end as "not supported", leaving v1 with three platforms plus Steam's coverage of their games.
- Emulator players have no support in v1.

**Nothing to change in code:** `Platform` still lists `retroachievements`, `rpcs3`, `xenia` and `local_file`, their provider stubs stay, and the `add-emulator-adapter` skill stays for later. The architecture keeps file watchers, which the Steam stats files need anyway (M2).

## Revisit if

- The M4 spikes find Epic, Ubisoft and EA all infeasible; an emulator might then be the better use of the time before release.
- Users ask for emulator support.
