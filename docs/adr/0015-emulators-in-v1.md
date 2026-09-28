# ADR-0015: shadPS4 and RPCS3 join v1

- **Status:** Accepted. Supersedes the emulator part of [ADR-0006](0006-v1-provider-scope.md)
- **Date:** 2026-09-28

## Context

[ADR-0006](0006-v1-provider-scope.md) moved every emulator after v1 so the launchers and consoles came first. They have: Steam, Xbox, PlayStation, Epic, Ubisoft and EA are all built and verified against real accounts, and M5 polish is under way.

The owner now plays PlayStation games on emulators and wants them tracked before release, starting with the two main PlayStation emulators: shadPS4 (PS4) and RPCS3 (PS3). More can follow.

Both keep trophies in local files, so they need no sign-in, no API and no secret: a file-based provider with a watcher, which the architecture already has for Steam's stats files. The trophies carry PlayStation's own trophy-set IDs (`NPWR…`), the same IDs the PlayStation provider uses.

What was checked on the owner's machine on 2026-09-28:

- **shadPS4** (`%APPDATA%\shadPS4`): each game's trophy list is `trophy\<NPWR>_00\Xml\TROPCONF.XML`, with names in `TROP.XML` and `TROP_00…20.XML` (one per language), and each shadPS4 user's progress is `home\<user id>\trophy\<NPWR>_00.xml`: the same XML with `unlockstate="true"` and a Unix `timestamp` on unlocked trophies. Real data exists (Bloodborne, 5 trophies unlocked).
- **RPCS3** (portable, `D:\Emulators\rpcs3-v0.0.41…`): installed, but no `dev_hdd0` and no trophy data yet, so its binary `TROPUSR.DAT` format cannot be checked against a real file (CLAUDE.md rule 10).

## Options considered

| Option | Result |
|---|---|
| Keep emulators after v1 (ADR-0006) | v1 misses games the owner actually plays |
| **shadPS4 and RPCS3 in v1, others after** | Covers the owner's emulators; each is a local-file provider with no auth work |
| Every planned emulator source in v1 (also Xenia, RetroAchievements, local file) | Release waits on sources nobody has asked for yet |

## Decision

v1 adds shadPS4 and RPCS3. Xenia, RetroAchievements and the generic local-file adapter (F-06) stay after v1, and more emulators can be added later, one at a time.

- **Order:** shadPS4 first, because its files are verified. RPCS3 once the owner has earned a trophy in it and its `TROPUSR.DAT` can be captured and checked.
- **Platform:** `shadps4` is added to `Platform`, beside the existing `rpcs3`. Both are shown as their own platforms, separate from PlayStation (PSN).
- **Connecting:** an emulator "account" is its data folder, found automatically where possible (shadPS4: `%APPDATA%\shadPS4`, or `user\` beside a portable install), else chosen by the user. It stores no secret. A folder with several emulator users is one account per user.
- **Rules still hold:** providers only read the emulator's own trophy files, never the running game or emulator process (rule 4), and parsers are defensive with size limits and fixture tests (rule 6).

## Consequences

**Positive:**

- The owner's emulated PlayStation games are tracked, with near real-time toasts from the file watcher.
- An emulated game can link exactly to the same game on PSN through its `NPWR` ID, not just by matching titles.

**Negative / to accept:**

- Emulator trophies have no "% of players", so they have no rarity unless a linked PSN copy provides one.
- RPCS3 is blocked until real trophy data exists.
- M6 (release) waits for this work.

**To do:** add `shadps4` to `Platform`; a shadPS4 provider and fixtures; an RPCS3 provider after its spike; an Emulators section in Accounts and onboarding; PROVIDERS.md sections for both; the roadmap gains an Emulators milestone before release.

## Revisit if

- An emulator changes its trophy file format in a way that can't be followed reliably.
- The owner starts using another emulator (Xenia, Vita3K, RetroAchievements...): add it with the `add-emulator-adapter` skill, recorded here or in a new ADR.
