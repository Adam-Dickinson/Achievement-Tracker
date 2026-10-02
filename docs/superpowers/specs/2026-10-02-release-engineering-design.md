# v1 release engineering

Status: approved in chat 2 October 2026, with the owner's choice that updates are notify-only (the app tells the user, who decides when to download). Last item before v1.0.0 ([ROADMAP](../../ROADMAP.md), M6).

## Goal

A user can download one installer from GitHub Releases, install it without admin rights, be told when a newer version exists, and update from inside the app when they choose to. The maintainer ships a release by pushing a tag. v1.0.0 is measured against the non-functional targets (SPEC N-01..N-07).

## Decisions already made

- Windows only for v1. No macOS or Linux build.
- Unsigned for v1. Windows SmartScreen shows "unknown publisher" until the app builds reputation; signing is a later item.
- Distribution and updates through GitHub Releases, using `electron-updater`.
- Updates are **notify-only**: nothing is downloaded until the user asks.

## Out of scope

Code signing, delta updates, update channels (beta), crash reporting, a macOS or Linux build, a Microsoft Store listing.

## 1. Installer

electron-builder, configured under `build` in `package.json`.

- `productName` "Trophy Locker", `appId` `io.github.adam-dickinson.trophy-locker`, icon `resources/icon.ico`, license GPL-3.0.
- NSIS, **per user, not per machine** (no admin prompt), the user may choose the folder, Start Menu shortcut, normal Windows uninstaller entry. Artifact name `Trophy-Locker-Setup-${version}.exe`.
- Package contents: `out/**`, `package.json` and the production dependencies (electron-builder adds them automatically). `node:sqlite` is part of Electron 44, so there are no native modules to rebuild.
- `publish` provider `github`, owner `Adam-Dickinson`, repo `Achievement-Tracker` (the repository keeps its old name).
- Scripts: `npm run dist` (build and package the installer) and `npm run dist:dir` (unpacked folder, used for measuring). Neither publishes.
- The version in `package.json` becomes `1.0.0` for the release; the tag must equal `v<version>` (the workflow checks).

## 2. Updates (notify-only)

`electron-updater` is a runtime dependency. `autoDownload` is **off**.

### UpdateService (main process)

An injectable class (the updater, the clock, the notifier and the settings store are passed in), so it is tested without Electron. State:

| State         | Meaning                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `disabled`    | Not packaged (`npm run dev`), or the user turned automatic checking off and has not checked by hand. |
| `idle`        | Nothing known; shows the last check time.                                                            |
| `checking`    | A check is running.                                                                                  |
| `available`   | A newer version exists: `{ version, releaseNotes? }`. Nothing downloaded.                            |
| `downloading` | The user asked to download: `{ version, percent }`.                                                  |
| `ready`       | Downloaded and verified: `{ version }`.                                                              |
| `error`       | The last check or download failed: a plain message.                                                  |

- **When it checks:** once about 10 seconds after launch (so startup is not slowed), then every 6 hours while the app runs, if **Automatically check for updates** is on (default on). **Check now** always works.
- **What the user is told:** when the state first becomes `available` for a version, and the user has not dismissed that version:
  - the **in-app banner** appears (below),
  - the **tray menu** gains "Update available: v<version>" which opens the window,
  - if the main window is hidden or minimised (the app is in the tray), one **system notification** ("Trophy Locker <version> is available") is shown, once per version. Clicking it opens the window.
- **Nothing is downloaded** until the user clicks **Download**. After the download electron-updater verifies the file against the SHA-512 in `latest.yml`; the state becomes `ready` and the banner offers **Restart and update**, which calls `quitAndInstall`. An update that is `ready` is also installed when the app next quits.
- A version the user dismisses with **Later** stays out of the banner and gets no further system notification until a newer version appears; it still shows in Settings and the tray.
- Failures never interrupt the user: they set `error` (shown in Settings only) and are logged. A missing network is not an error worth a banner.

### Privacy

Update checking is the first time the app contacts anything other than the platforms the user connected. It sends the normal HTTPS request to github.com for the release feed, which carries only the usual details of a web request (such as the IP address), with no account, game or library information. The app replaces the updater's random per-install staging id header with a fixed value so no per-install id is sent. The Updates card and the README say so, and turning **Automatically check for updates** off stops all automatic traffic. Recorded in a new ADR (0016).

### IPC (rule 9: sender checked, payloads validated)

| Call                             | Channel                        | Payload | Result                                              |
| -------------------------------- | ------------------------------ | ------- | --------------------------------------------------- |
| `getUpdateState()`               | `updates:get-state`            | none    | `UpdateState` plus `autoCheck` and `currentVersion` |
| `checkForUpdates()`              | `updates:check`                | none    | `UpdateState` after the check starts                |
| `downloadUpdate()`               | `updates:download`             | none    | `UpdateState`                                       |
| `installUpdate()`                | `updates:install`              | none    | `void` (quits and installs)                         |
| `dismissUpdate()`                | `updates:dismiss`              | none    | `UpdateState` (remembers the dismissed version)     |
| `setAutoCheck(on)`               | `updates:set-auto-check`       | boolean | `UpdateState`                                       |
| `onUpdateStateChanged(listener)` | `updates:state-changed` (push) |         | the new `UpdateState`                               |

Saved settings: `updates.autoCheck` (boolean, default true), `updates.dismissedVersion` (string), `updates.notifiedVersion` (string, so a restart does not repeat the system notification).

### Screens

- **Banner** (in the app shell, above the page, visible on every screen): "Version 1.1.0 is available." with **Download** and **Later**; while downloading a progress bar; when ready "Version 1.1.0 is ready." with **Restart and update**. It is a `role="status"` region, not a modal.
- **Updates card** in Settings: current version, the state in words, the last check time, **Check now**, **Download** or **Restart and update** as the state allows, and the **Automatically check for updates** switch with the privacy sentence beside it.

## 3. Release workflow

`.github/workflows/release.yml`, triggered by pushing a tag `v*`:

1. Check the tag equals `v` plus the `package.json` version.
2. `npm ci`, `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`.
3. `npm run build`, then electron-builder with `--publish always` on `windows-latest`, using the built-in `GITHUB_TOKEN` (no new secrets).
4. The result is a **draft** GitHub Release holding the installer, `latest.yml` and the blockmap. The maintainer reads it, edits the notes and presses Publish; electron-updater only sees published releases.

## 4. Measurement

`docs/PERFORMANCE.md` records, on the unpacked build of v1.0.0 and the machine used: N-05 installer size, N-06 cold start to tray, N-02 idle memory (private working set across all processes), N-01 idle CPU over five minutes, N-03 and N-04 unlock-to-toast latency (from the existing timing line), and N-07 a large library. For N-07 a script generates a database with 5,000 games and 200,000 achievements so the run can be repeated. A figure outside its target is reported as it is, with the decision (fix, or revise the target in SPEC) recorded.

## 5. Docs and the ADR

- ADR-0016: unsigned Windows installer, GitHub Releases, notify-only `electron-updater`, and the privacy trade-off.
- README: a **Download** section with the SmartScreen steps ("More info", then "Run anyway") and what the update check contacts.
- SPEC (the update IPC rows, N-targets with measured results), ROADMAP (M6 ticked), PROJECT-MAP, ARCHITECTURE (packaging row), CLAUDE.md (commands: `dist`, `dist:dir`; status).

## Tests

- `update-service.test.ts` (fake updater, clock and notifier): the state machine for every transition above, the first check delayed about 10 seconds and then repeating every 6 hours, no automatic check when the switch is off, nothing downloaded until `downloadUpdate`, one system notification per version and none when the window is visible or the version was dismissed or already notified, `error` on a failed check without throwing, and `disabled` when not packaged.
- Settings: reading and saving `updates.*` with fallbacks for bad values.
- IPC: each handler checks the sender and validates its payload.
- Renderer: `UpdateBanner` (each state's buttons and text, **Later** dismisses, `role="status"`), `UpdatesCard`, the tray menu entry.
- Checked by hand and recorded in the PR: the installer installs per user and uninstalls cleanly; installing over an older build keeps the data folder; a real update from a test release to a later one through the banner; the workflow produces a draft release on a test tag; the unsigned SmartScreen steps in the README are accurate.

## Deviations

- `disabled` means only "not packaged" (`npm run dev`). Turning automatic checking off leaves the state `idle` (a check by hand still works), so the table above overstates `disabled`.
