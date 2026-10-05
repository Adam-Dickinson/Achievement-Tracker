# ADR-0017: Launching installed games

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

After v1 the owner wants to start any installed game from the app: a Play button on Game detail and an Installed filter in the Library. The design is in `docs/superpowers/specs/2026-10-05-launch-games-design.md`. This ADR records the decisions that outlive that plan. Starting a game touches the same area as anti-cheat, so the first constraint is rule 4: the app never injects into or reads the memory of a game process.

Whether a game is installed is not in the database. Each launcher keeps it in its own place (Steam's `appmanifest` files, the Ubisoft registry, Epic's manifests, an emulator's game list), and it changes whenever the user installs or uninstalls something outside the app.

## Options considered

| Option | Result |
|---|---|
| Store installs in SQLite (a new table or an `installed` column) | Survives restarts, but it goes stale the moment a game is installed or removed outside the app, needs a migration and a reconciliation pass, and the data is cheap to rebuild |
| Let the renderer send a URI or a path to start | Simplest IPC, but the renderer is untrusted web content (rule 9) and would be able to start any program |
| Start games by reading and watching the game process | Would give "running" state, but breaks rule 4 and is a risk with anti-cheat |
| **Scan in memory, match to the library on demand, start only through the platform's launcher or the emulator** | No schema change, always as fresh as the last scan, and the renderer never names a target |

## Decision

- **Launching goes only through the platform's own launcher or the emulator** (a `steam://`-style URI, or the emulator program with the game as its argument). The app never reads or touches a game process. Nothing waits for the game to exit.
- **Installs are scanned in memory.** `LaunchService` keeps the last scan result and never writes it to SQLite, so there is no migration. It matches the scan to the library each time it is asked (`matchInstalled`): the same platform and external id, else the same platform and the same normalised title. Unmatched installs are ignored.
- **The renderer sends only a `platformGameId`.** Main looks the target up in its own scan. No URI, path or argument crosses IPC (rule 9). The reply is `{ ok: true }` or `{ ok: false, reason }` with a plain message, never a thrown error.
- **One adapter per source**, built like the providers: an `InstallAdapter` (`platform`, `findInstalled()`) returning `InstalledGame` values with a `LaunchTarget` (`uri` or `program`). Adapters do no SQL and know nothing about the UI. A failing adapter is logged and the rest of the scan continues.
- **The guarded starter** (`start.ts`) is the only code that opens a target. A URI must have one of the allowed schemes (`steam`, `uplay`, `com.epicgames.launcher`, `origin2`) and no whitespace. A program must end in `.exe` and exist, and is spawned detached with an argument array and `shell: false`.
- **Scans run** 10 seconds after start (so cold start is not slowed), when the window gains focus (at most once a minute) and after a failed Play. Overlapping scans share one run. A scan that finishes pushes `launch:installed-changed` to the main window. There is no Rescan button yet; the `launch:rescan` call exists for the emulator work.
- **Unverified adapters are marked as such** in `docs/PROVIDERS.md` and fail safely (an empty list, a logged warning), because install layouts must be checked on a real machine before they are trusted (rule 10).
- **Steam is the first adapter.** It reads the Steam path from the registry, every library folder in `libraryfolders.vdf`, and each `appmanifest_<appid>.acf` whose `StateFlags` has bit 4 set. The target is `steam://rungameid/<appid>`.
- **RPCS3 is the first emulator.** Its adapter reads `config/games.yml` (Windows absolute paths only), and reads each game's title from `PS3_GAME/PARAM.SFO` inside the ISO 9660 image, because nothing local links the trophy set (`NPWR00881_00`) to the serial (`BLUS30443`); the existing title matching then links it to the library entry. Titles are read 4 at a time with a 10 s limit each. The program is found beside the data folder (`rpcs3.exe` next to `dev_hdd0`) or chosen by the user in the Emulator program row under a connected RPCS3 account on Accounts; the choice is saved in settings. A program target must be a Windows absolute `.exe` path. The target is `rpcs3.exe --no-gui <path>`; the start by hand is not yet verified.
- **RPCS3 covers go through the `trophy-art://` protocol** (`src/main/trophy-art.ts`), not `file://` URLs. The dev renderer loads from `http://localhost`, which cannot load `file://` images, and a `file://` cover would put the local path in the data and in data exports. The protocol serves only a connected RPCS3 account's `ICON0.PNG` for an id like `NPWR00881_00` (PNG signature checked, 2 MB cap), so the URL never names a path.
- **shadPS4 launching is deferred.** No shadPS4 game is installed on the owner's machine to check against (rule 10); `shadPS4.exe -g <game path or ID>` has been seen only in `--help`. It gets its own change once a game is installed.
- **Game detail shows one button per install** (labelled "Play", or "Play on <platform>" when there are several) rather than a menu. The Library gets an Installed toggle filtered in the UI (ADR-0014).

## Consequences

**Positive:**

- No schema change, no stale data to repair, and one place (`start.ts`) to audit for what can be started.
- Adding a launcher is one adapter, one line in `index.ts` and its URI scheme in the allow-list in `src/main/launch/start.ts`.
- The renderer cannot start anything the main process did not find itself.

**Negative:**

- The installed list is empty until the first scan finishes, so Play appears a few seconds after start, and the Installed option is shown disabled until the first scan finds an install.
- Installs made while the app has focus show up only after the next focus scan or a failed Play, until a Rescan button exists.
- Title matching can miss a game whose store title differs from the library title; an id match avoids that where the ids agree.
- Title matching can also match the wrong game, because edition words are dropped ("BioShock" and "BioShock Remastered" normalise alike). Installs matched by external id are claimed first and are never offered to another game by title, and each install serves at most one title match, but two owned editions with only one installed under a different id can still be confused.
- RPCS3 covers are served through the allow-listed `trophy-art://` protocol: `file://` images are blocked from the dev server origin and expose local paths.
- The Steam launch URI and the RPCS3 `--no-gui <path>` start are not yet checked by hand (`docs/PROVIDERS.md`).

**Follow-ups:**

- The other adapters (Ubisoft, Epic, EA, Xbox, shadPS4), each in its own change with what was verified recorded in `docs/PROVIDERS.md`.
- A Rescan button.
