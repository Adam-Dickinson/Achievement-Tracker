# Performance: v1.0.0 measurements

Measured on 2 October 2026 against the non-functional targets N-01 to N-07 in [SPEC.md](SPEC.md) section 2.

## Machine and build

- CPU: AMD Ryzen 7 9700X, 8 cores, 16 logical processors
- RAM: 31 GB
- OS: Windows 11 Pro, version 10.0.26300
- Build: version 1.0.0 packaged by `npm run dist:dir` (`release/win-unpacked/Trophy Locker.exe`, Electron 44.4.3); the installer from `npm run dist`

## Results

| ID | Target | Measured | Verdict |
|---|---|---|---|
| N-01 | Idle CPU in the tray: under 0.5% average | 0.16% of one core (0.010% of the whole machine), average over 299 s | Within target |
| N-02 | Idle memory in the tray: at most 200 MB private | 173.3 MB average, 176.7 MB peak, across 4 processes (peak working set 329.9 MB) | Within target |
| N-03 | Unlock-to-toast, local providers: under 2 s | Not re-run. Earlier check: 1,397 of 1,412 Steam unlocks read from the local stats files matched the Web API's within 2 s (ROADMAP, M2); the toast follows the file change by one sync | Not re-measured |
| N-04 | Unlock-to-toast, polling providers: at most poll interval plus 5 s | Not re-run. Earlier checks are in [PROVIDERS.md](PROVIDERS.md) and ROADMAP M2 (Steam's Web API itself reported unlocks 70, 71 and 153 s late) | Not re-measured |
| N-05 | Installer size: under 120 MB | `Trophy-Locker-Setup-1.0.0.exe` is 117,285,127 bytes (111.85 MiB, 117.3 MB) | Within target |
| N-06 | Cold start to tray: under 3 s | 2.87 s from process start to the `Ready in the tray` log line | Within target, narrowly |
| N-07 | 5,000+ games and 200,000+ achievements handled smoothly | 5,000 games and 200,000 achievements: `listLibraryGames` 76.1 ms, `getDashboardStats` 266.8 ms, `listActivity` (50 items) 7.8 ms; each must be under 2,000 ms | Within target |

## Method

**N-01, N-02 and N-06** come from `scripts/measure-idle.ps1`, run against the packaged unpacked build:

```
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
.\scripts\measure-idle.ps1 -ExePath "release\win-unpacked\Trophy Locker.exe" -Minutes 5
```

The script starts the app with `--hidden` and a fresh `--user-data-dir` in a temp folder, so the app sits in the tray with no connected accounts and no database. It takes the cold start as the time from the process's start to the `time` of the `Ready in the tray` line the app logs once its tray exists. It then waits 30 seconds for the app to settle and samples every 5 seconds for 5 minutes (60 samples): private memory and working set summed over every process of the exe, and the processes' total CPU seconds. The CPU figure is the growth in CPU seconds divided by the wall seconds, shown as a share of one core and of the whole machine. Finally it stops the app.

Because the build is packaged, the update service is active, so the app may have contacted github.com during the run (an update check about 10 seconds after launch). That is expected and part of the idle cost a user sees. In this run the check happened 10 seconds after the tray was ready and failed with "No published versions on GitHub" (the repository has no published release yet); the failure is logged and shown nowhere else.

**N-05** is the size of the installer file produced by `npm run dist`.

**N-07** is `src/main/store/large-library.test.ts`, run once with `TL_LARGE=1` (it is skipped by default, so `npm test` stays fast):

```
$env:TL_LARGE='1'; npx vitest run src/main/store/large-library.test.ts --disableConsoleIntercept
```

It builds an in-memory database with the real migrations (so N-07 runs against an in-memory database, not the on-disk file the app uses): one account, 5,000 games, 40 achievements each (200,000), and 12 unlocks per game (60,000, 30%). Seeding took 662.7 ms. It then times the three reads the main screens use, with `performance.now()`. The lists in the UI are virtualized (ADR-0014) and covered by component tests, so only the data side is timed here; this test does not measure rendering.

## Caveats

- One run each, on one fast machine. A slower machine will give slower figures; the cold start in particular has only 0.13 s of headroom, so it should be re-measured on slower hardware before it is relied on.
- The idle run had no connected accounts. With accounts connected, the scheduler's polling adds some CPU and memory that this run does not include.
- N-03 and N-04 were not re-measured for 1.0.0; the figures above are the earlier measurements.
