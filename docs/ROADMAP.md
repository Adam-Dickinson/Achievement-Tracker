# Roadmap

Ordering principle: **prove the riskiest, most valuable path end-to-end first** (Steam poll → DB → overlay toast), then widen.

## M0: Foundations and spikes (1-2 weeks)

- [x] Decide open questions in DESIGN.md §11 (license, OS scope, Steam key strategy): Windows only for v1, the user's own Steam key (no server), GPL-3.0, and hidden achievements show their name with the description revealed after unlock
- [x] Scaffold: Electron + TypeScript + React project per [ARCHITECTURE.md](ARCHITECTURE.md) §6. Verified: lint, typecheck, 27 tests and the production build pass, and the built app was run: window, IPC and SQLite schema, tray-driven close, single instance, and a click-through toast. `npm run dev` also verified
- [x] CI workflow written (`.github/workflows/ci.yml`); confirmed passing on GitHub Actions
- [x] Decide how main-process services are composed and shared: plain modules wired by hand in `src/main/index.ts`, no DI container ([ARCHITECTURE.md](ARCHITECTURE.md) §2)
- [~] **Spike A:** overlay window: transparent, click-through, no focus steal. Built and verified on Windows (window carries `WS_EX_TRANSPARENT` and `WS_EX_NOACTIVATE`; toast shown over a Steam window). Still to verify over a real borderless-windowed game and with multiple monitors / mixed DPI
- Spike B (RPCS3 trophy files) moved to After v1 and Spike C (Epic, Ubisoft, EA) to M4 ([ADR-0006](adr/0006-v1-provider-scope.md))
- [~] Mockups: Dashboard, Library, Game detail, Toast, Accounts, Notification settings, Onboarding are designed on the canvas in the "Afterglow" direction ([docs/design](design/README.md), [DESIGN.md](DESIGN.md) §7). Still to do: design Activity, and re-export the HTML snapshots in `docs/design/mockups/` (they still show the earlier look). The tray menu is a native Electron menu, so it needs no visual design
- **Exit:** scaffold builds in CI, overlay spike works

## M1: Vertical slice, Steam and toasts (MVP core)

- [x] Domain types + provider interface (`src/shared`); database + migration runner (`src/main/store`); `SecretStore` (`SafeStorageSecretStore`: encrypted with `safeStorage`, kept in `secrets.json`)
- [x] Sync engine: scheduler, diff, baseline rule, backoff with jitter, `UnlockEvent`. Built and tested: library scope (finds games, never forgets one), game scopes with tiered polling, and the baseline cutoff for games found later (ADR-0005)
- [x] Steam provider (Web API): library, schema, unlocks, rarity. Built, tested against captured replies, verified live against a real account, and registered with the Scheduler. The library includes games borrowed through Steam Families while they are in the two-week recently-played window. The Accounts screen connects an account: it checks the key with Steam, stores it in the `SecretStore` and starts syncing straight away
- [x] Notification service + overlay toast (queue, preview). Unlocks from the sync engine become toasts, up to 3 stacked on screen with the rest queued, duplicates dropped, more than 5 at once collapsed into one; the test notification goes through the same queue; Pause notifications in the tray. Sound moved to M5 (F-22 is P1)
- [x] Tray, close-to-tray, single instance, autostart. The tray menu has Pause notifications and Start with Windows; a login start stays in the tray. Start with Windows only works in the installed app, so it is checked for real once the installer exists (M6)
- [x] UI: Accounts (connect Steam), Library, Game detail, basic Dashboard. The Dashboard shows real totals, "Nearly there" and recent unlocks. Accounts is built for Steam (connect form, and an account list that updates itself as a sync finds games). Library (grid with colour-in covers, sort) and Game detail (tiles, filters, achievements rarest first) are built on real data and refresh as syncs land
- **Exit:** unlock a Steam achievement in a real game and a toast appears within the poll interval

## M2: Real-time Steam and Xbox

- [ ] Near real-time Steam toasts (a toast seconds after an unlock, not up to 5 minutes). Two signals, both from Steam itself, never from the game (rule 4); see PROVIDERS.md, Steam, "Local files and plan". Both are built; the item is done once a real unlock shows the delay:
  - [x] Steam local stats files (`appcache/stats/UserGameStats_<accountid>_<appid>.bin`): watch the folder and sync that one game straight away when its file changes (`SteamProvider.watch()`, `Scheduler.syncGameNow()`). A game the library doesn't list yet triggers one library look first
  - [ ] Borrowed Steam Families games last played more than two weeks ago, which the Web API can't list: their stats file changes, but the library look can't find them, so they are skipped for now (would need the game's title from its schema)
  - [x] Running-game detection (Steam's `RunningAppID` registry value) → fast polling (every 30 s) of the game being played, as a safety net for a missed file write; a game not played lately is checked the moment it launches instead of up to 6 hours later. Verified live: `RunningAppID` holds the appid while a game runs
  - [ ] Timing check with a real unlock: when Steam rewrites the stats file relative to the unlock, and how soon `GetPlayerAchievements` shows it. Launching and quitting without an unlock was checked (no file write, 2026-09-25); the app now logs each unlock's delay, so the next unlock during `npm run dev` answers it
- [x] Xbox provider (OAuth via browser/loopback redirect, token refresh). Verified against a real account and built: the provider, the scheduler's credential refresh (ADR-0007), the sign-in in the main process, and the Xbox card on the Accounts screen with the "unofficial" opt-in; a live run fetched all 13 games of a real library
- [x] Activity feed screen: every dated unlock across platforms, newest first, grouped under day headings, with description, game, platform, rarity and time; "Show more" loads 50 more (up to 1,000); refreshes as syncs land; a row opens its game. Built without a canvas design, in the Afterglow style of the Dashboard's recent unlocks
- **Exit:** unlocks from Steam and Xbox appear in one library and fire toasts; a Steam unlock toasts within seconds

## M3: Epic, Ubisoft and EA (spike first)

Moved ahead of PlayStation at the owner's request ([ADR-0008](adr/0008-stores-before-playstation.md)).

- [x] **Spike C:** can each be read without storing the user's password (rule 5)? Which games have store-specific achievements that Steam doesn't already cover? Write the verdicts into PROVIDERS.md. **Epic: feasible** (2026-09-25; unofficial, the launcher's own services, signed in with a code from the browser). **Ubisoft: feasible** (2026-09-25; unofficial, the launcher's own services, signed in on Ubisoft's page in an app window, [ADR-0009](adr/0009-ubisoft-sign-in-window.md)). **EA: feasible** (2026-09-25; unofficial, the EA app's own services, signed in on EA's page in an app window, then its session cookies traded for tokens)
- [x] Epic provider, or documented as not supported. Built and verified live against a real account: the provider (sign-in with a pasted code, refresh-token rotation, library filtered to games with Epic achievements, catalog titles and covers, rarity, unlock dates), registered with the Scheduler, `connectEpic`/`openEpicSignIn` over IPC, and the Connect Epic card on the Accounts screen; a real account connected from the app
- [x] Ubisoft Connect provider, or documented as not supported. Built and verified live: the provider (remember-me tickets traded for launcher sessions, renewed one at a time and only when the Scheduler refreshes, games with Ubisoft achievements in one query, unlock dates, no rarity), the sign-in window, registered with the Scheduler, `connectUbisoft`/`cancelUbisoftSignIn` over IPC, and the Connect Ubisoft card on the Accounts screen; a real account connected from the app (10 games, 79 unlocks, a silent first sync)
- [ ] EA app provider, or documented as not supported (the likely verdict)
- **Exit:** each of the three is either a working provider with fixtures or a recorded "not supported" verdict

## M4: PlayStation and unified library (P0 complete)

- [ ] PSN provider (NPSSO flow, opt-in warning)
- [ ] Cross-platform game linking (auto-match + manual merge/split)
- [ ] Artwork for every game. Today 4 of 231 games have no cover, all Epic games whose catalog entry is empty. In order: borrow the cover of a linked copy on another platform; otherwise look the game up on the Steam store by title (a public search with no key; verify it first, rule 10); as a last resort, generate an Afterglow-style cover (the title on a gradient) so no card is blank. Also find the real title for Epic games whose catalog is empty and whose library name is a codename (for example "yorkie Production")
- [ ] Dashboard stats (completion %, rarest, closest to 100%)
- [ ] Search/filter/sort, virtualized lists
- **Exit:** a game owned on two platforms shows as one entry with per-platform tabs, and every game in the Library has an image

## M5: Polish and notification depth

- [ ] Notification settings (corner, monitor, scale, rarity styling, per-platform toggles)
- [ ] Toast sound per rarity tier, with volume and a mute (F-22)
- [ ] Native toast fallback, Do Not Disturb schedule (manual pause is in the tray already)
- [ ] Onboarding flow, empty/error states, provider health UI
- [ ] Accessibility pass, reduced motion, high contrast
- [ ] Data export, log viewer

## M6: Release engineering

- [ ] Code signing, signed auto-update channel
- [ ] Installer (electron-builder, NSIS), code signing, signed auto-update; measure memory and size against N-02 / N-05
- [ ] Performance validation against N-01..N-07
- [ ] Crash reporting (opt-in), docs site/README screenshots
- [ ] v1.0.0

## After v1: emulators

Not in v1 ([ADR-0006](adr/0006-v1-provider-scope.md)). Notes for each stay in PROVIDERS.md.

- RetroAchievements provider (covers RetroArch, DuckStation, PPSSPP, PCSX2, Dolphin)
- RPCS3: Spike B (trophy file format, fixture from real files), then a provider with a file watcher (< 2 s latency)
- Xenia: feasibility spike, then a provider if viable
- Generic local-file adapter

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Unofficial APIs (PSN, Xbox, Epic, Ubisoft, EA) break or are blocked | Provider outage | Isolation, clear "needs attention" state, fixtures, keep Steam solid |
| Exclusive-fullscreen hides the overlay | Missed toasts | Native toast fallback, docs, Activity feed |
| Idle memory above the N-02 target | Not "lightweight" | Measured baseline ~170 MB private in the tray. Options: create the overlay on demand, disable GPU acceleration, trim dependencies; see ADR-0003 |
| Local file formats change (Steam's stats files) | Parser breakage | Pinned fixtures, defensive parsing, version detection |
| ToS concerns for unofficial providers | Legal/ban risk for users | Opt-in with warnings, tokens only, no game injection |
| First-sync toast flood | Terrible UX | Baseline rule (F-16), burst collapsing |
