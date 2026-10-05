# Launching installed games

Status: design approved in chat 5 October 2026. First item of the post-v1 milestone "launch installed games" ([ROADMAP](../../ROADMAP.md)). Recorded in [ADR-0017](../../adr/0017-launching-installed-games.md). The base and the Steam adapter are built; where the build differs from this design is listed under Deviations at the end.

## Goal

A user can start any game they have installed, on any platform Trophy Locker tracks, from the app. Game detail has a **Play** button, and the Library can be filtered to **Installed** games. Store games start through their own launcher, and emulated games start through the emulator.

## Decisions already made

- Scope is every platform the app tracks: Steam, Xbox, Epic, Ubisoft, EA, shadPS4 and RPCS3 (not PlayStation consoles, which are not launchable from a PC).
- Play lives on **Game detail**; the Library gets an **Installed** filter. No Play button on Library cards.
- A game installed through more than one launcher shows a small picker on the Play button.
- Emulator programs are **found automatically first and asked for only when that fails**, in the emulator's card on the Accounts screen.
- Launching always goes through the platform's own launcher or the emulator. The app never reads or touches a game process (CLAUDE.md rule 4).

## Out of scope

Closing games, tracking play time, launch options or arguments chosen by the user, launching on macOS or Linux, shortcuts on the desktop, a "recently played" row, and games installed outside the platform's own folders when no launcher knows about them.

## 1. The launch module (`src/main/launch/`)

Built like the providers: one adapter per source, a registry, no SQL and no UI knowledge in the adapters.

```
interface InstalledGame {
  platform: Platform
  externalId: string
  title: string
  target: LaunchTarget
}

type LaunchTarget =
  | { kind: 'uri'; uri: string }
  | { kind: 'program'; exe: string; args: string[] }

interface InstallAdapter {
  platform: Platform
  findInstalled(signal?: AbortSignal): Promise<readonly InstalledGame[]>
}
```

- **Steam:** the Steam path from the registry (`HKCU\Software\Valve\Steam\SteamPath`), then every `path` in `steamapps/libraryfolders.vdf`, then each `appmanifest_<appid>.acf` whose `StateFlags` says fully installed. Target `steam://rungameid/<appid>`. Verified on the owner's machine (3 library folders, 13 manifests in the first).
- **Ubisoft:** installs under `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\<id>\InstallDir`. Target `uplay://launch/<id>/0`. The registry entries exist on the owner's machine (ids 1081 and 66088); the URI is verified by launching one.
- **Epic:** `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item` (JSON with `AppName`, `DisplayName`, `InstallLocation`, `LaunchExecutable`). Target `com.epicgames.launcher://apps/<AppName>?action=launch&silent=true`. Unverified: nothing installed on the owner's machine.
- **EA:** the EA app's install registry or its `InstallData` files, target through the EA app's `origin2://game/launch/?offerIds=<id>` link. Unverified.
- **Xbox:** installed Game Pass and Store games from the package repository (`Get-AppxPackage` equivalent through the registry `GamingServices\PackageRepository`), target `shell:AppsFolder\<PackageFamilyName>!<AppId>` opened with `explorer.exe`. Unverified.
- **RPCS3:** the games listed in `<rpcs3>\config\games.yml` (serial to game path; the owner's file has `BLUS30443` pointing at an ISO). Target is the program (see section 3) with the game path as its argument. The serial is matched to the library entry through the `PARAM.SFO`-style data the provider already reads, or by title.
- **shadPS4:** game folders under the emulator's `installDirs` and `game_data`; target is the program with the game's `eboot.bin` path. Unverified for the exact command line.

**Matching to the library:** an installed game matches a `platform_game` row when the platform and `externalId` are equal, else when the platform is equal and the title matches after normalising (lower case, punctuation and edition words removed). A match sets `installed` for that entry. Unmatched installs are ignored (the app lists games the user owns and tracks, not everything on disk).

**Scanning:** the whole scan runs at startup (after the first window is shown, so it does not slow cold start), after an account connects or a library look finds games, and on a **Rescan** action. The result is kept in memory, never saved to SQLite. A failing adapter reports its error and the rest continue.

## 2. Starting a game

- `uri` targets: `shell.openExternal(uri)`, after checking the scheme is one of `steam`, `uplay`, `com.epicgames.launcher`, `origin2`, or the Xbox `shell:AppsFolder` form. Any other scheme is refused.
- `program` targets: `child_process.spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false, shell: false })`, then `unref()`. Arguments are an array, never a joined string.
- The launch result is `started` or an error with a plain message. Nothing waits for the game to exit.

## 3. Emulator programs

Each emulator has a saved setting `emulator.<id>.exe` (a path).

- **Finding it:** RPCS3: `rpcs3.exe` in the data folder's parent (the owner's install is portable, so the data folders sit beside it). shadPS4: common install folders and the BBLauncher layout `…\BBLauncher\<version>\shadPS4.exe` (newest version), because its data folder is in `%APPDATA%` and says nothing about the exe.
- **Asking:** when nothing is found, the emulator's card shows "Set the emulator program" with a **Browse** button (a file dialog in the main process, `.exe` only). A found path is shown and can be changed.
- **Validation:** the path must exist, be a file and end in `.exe`. A path that later disappears makes Play report "The emulator program was not found" and offers to set it again.

## 4. IPC (rule 9: sender checked, payloads validated, no paths or URIs from the renderer)

| Call | Channel | Payload | Result |
| --- | --- | --- | --- |
| `getInstalled()` | `launch:get-installed` | none | `{ gameId, platformGameId, platform }[]` (`InstalledEntry`) |
| `playGame(platformGameId)` | `launch:play` | positive integer | `{ ok: true }` or `{ ok: false, reason }` |
| `rescanInstalled()` | `launch:rescan` | none | the new installed list |
| `onInstalledChanged(listener)` | `launch:installed-changed` (push) | | the new list |
| `getEmulatorPrograms()` | `launch:get-emulator-programs` | none | `{ emulator, path: string or null, found: 'auto' or 'chosen' or null }[]` |
| `chooseEmulatorProgram(emulator)` | `launch:choose-emulator-program` | `'rpcs3'` or `'shadps4'` | the updated entry (opens the dialog in main) |

Main looks the target up from its own scan by `platformGameId`. The renderer never supplies a URI, a path or arguments.

## 5. Screens

- **Game detail:** a **Play** button in the header for entries with an install. One install: it starts the game. Several: the button opens a small menu naming each launcher ("Play on Steam", "Play on Epic"). While starting it shows "Starting…" and then returns; a failure shows the reason beneath the button. No install: no button.
- **Library:** an **Installed** toggle in the filters, alongside the platform filter. It counts and filters client-side from `getInstalled()` (ADR-0014).
- **Emulator cards (Accounts):** the "Emulator program" row described in section 3.
- Not shown while the scan is still running for the first time: the Play button and the filter appear once results arrive.

## 6. Errors

- A launcher that is not running starts it (that is what the URIs do); a launcher that is not installed gives "Could not open <launcher>".
- A game uninstalled since the last scan: Play re-checks the target and reports "That game is no longer installed", then rescans.
- Adapter failures are logged (redacted) and the rest of the scan continues; the Installed list is simply smaller.

## 7. Delivery in phases (one PR each, after the base)

1. Base: types, registry, matching, scan scheduling, IPC, Play button, Installed filter, ADR-0017.
2. Steam adapter.
3. Ubisoft adapter.
4. Epic adapter.
5. EA adapter.
6. Xbox adapter.
7. RPCS3 and shadPS4: exe finding, the Emulator program row, the two adapters.

Each adapter phase records in PROVIDERS.md what was actually verified (rule 10). Adapters that cannot be checked on the owner's machine ship marked **unverified** and fail safely.

## Tests

- Matching: id match, title normalisation, no match, two installs of one game.
- Each adapter against sanitised fixtures (`tests/fixtures/launch/<platform>/`): a manifest, an Epic `.item`, a registry dump shaped as a plain object, `games.yml`; malformed input yields an adapter error, not a throw out of the scan.
- Starting: URI scheme allow-list (accepted and refused schemes), `spawn` called with an argument array and `shell: false`, an unknown id, an uninstalled game.
- Emulator programs: the finding rules, validation of a missing path, a non-`.exe` path.
- IPC: each handler checks the sender and validates its payload; no handler accepts a path or URI.
- Renderer: Play button states (none, one, several, starting, failed), the Installed filter, the Emulator program row.
- Checked by hand: a Steam game and a Ubisoft game start; RPCS3 starts Demon's Souls from the Play button.

## Docs

ADR-0017, SPEC (the IPC table), PROVIDERS.md (per adapter, with what was verified), PROJECT-MAP, ARCHITECTURE, ROADMAP.

## Deviations (as built, base and Steam)

- **One button per install, not a menu.** Game detail shows a Play button for each install of the game ("Play" with one, "Play on <platform>" with several) instead of one button that opens a picker.
- **`getInstalled()` entries are `{ gameId, platformGameId, platform }`.** There is no `launchable` field; an entry exists only when the game is installed and matched.
- **Scan triggers:** 10 seconds after start, when the window gains focus (at most once a minute) and after a failed Play. There is no scan after an account connects, and no Rescan button yet; `rescanInstalled` exists for the emulator card work.
- **The Steam adapter** dedupes the main library by a normalised path (the registry gives `c:/program files (x86)/steam` with forward slashes, `libraryfolders.vdf` uses backslashes), accepts only object entries in `libraryfolders.vdf` (the legacy string-entry format is dropped), and counts a manifest as installed when `StateFlags` has bit 4.
- **`findInstalled()` takes no `AbortSignal`** and the Xbox `shell:AppsFolder` scheme is not in the URI allow-list yet (it arrives with the Xbox adapter).
- **A failed start triggers a rescan; Play does not re-check the target.** Section 6's "Play re-checks the target and reports 'That game is no longer installed'" is not built: `play` starts the target from its last scan and rescans if the start fails.
- **The installed-changed push carries no payload.** The renderer refetches with `getInstalled()`.
- `ToggleGroup` options gained an optional `disabled` for the Installed filter.

## Deviations (as built, RPCS3)

- **shadPS4 launching is not built.** No shadPS4 game is installed on the owner's machine, so rule 10 cannot be met; `shadPS4.exe -g <game path or ID>` is known from `--help` only.
- **RPCS3 games match the library by their own title.** The adapter reads `TITLE` from `PS3_GAME/PARAM.SFO` in the game's ISO 9660 image, because nothing local links the trophy set to the serial. Titles are read 4 at a time with a 10 s limit each.
- **Program targets must be Windows absolute `.exe` paths**, and `games.yml` entries must be Windows absolute paths.
- **The Emulator program row is built for RPCS3 only** and sits under the first connected RPCS3 account card on Accounts, not in an `EmulatorCard` footer. It is not built for shadPS4 yet.
- **RPCS3 cover art uses the `trophy-art://rpcs3/<npCommId>` protocol**, not `file://` URLs (the dev renderer at `http://localhost` cannot load them), so no local path reaches the UI or data exports.
- **Not verified by hand:** starting a game with `rpcs3.exe --no-gui <path>` (owner to test).
