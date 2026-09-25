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

- [ ] Near real-time Steam toasts (a toast seconds after an unlock, not up to 5 minutes). Two signals, both from Steam itself, never from the game (rule 4); see PROVIDERS.md, Steam, "Local files and plan":
  - [ ] Steam local stats files (`appcache/stats/UserGameStats_<accountid>_<appid>.bin`): watch the folder and sync that one game straight away when its file changes. Also finds borrowed Steam Families games last played more than two weeks ago, which the Web API can't list
  - [ ] Running-game detection (Steam's `RunningAppID` registry value) → fast polling (about every 30 s) of the game being played, as a safety net for a missed file write; a game not played lately is checked the moment it launches instead of up to 6 hours later
  - [ ] First, a timing check during a play session: when Steam rewrites the stats file relative to the unlock, and how soon `GetPlayerAchievements` shows it
- [x] Xbox provider (OAuth via browser/loopback redirect, token refresh). Verified against a real account and built: the provider, the scheduler's credential refresh (ADR-0007), the sign-in in the main process, and the Xbox card on the Accounts screen with the "unofficial" opt-in; a live run fetched all 13 games of a real library
- [ ] Activity feed screen
- **Exit:** unlocks from Steam and Xbox appear in one library and fire toasts; a Steam unlock toasts within seconds

## M3: PlayStation and unified library (P0 complete)

- [ ] PSN provider (NPSSO flow, opt-in warning)
- [ ] Cross-platform game linking (auto-match + manual merge/split)
- [ ] Dashboard stats (completion %, rarest, closest to 100%)
- [ ] Search/filter/sort, virtualized lists
- **Exit:** a game owned on two platforms shows as one entry with per-platform tabs

## M4: Epic, Ubisoft and EA (spike first)

- [ ] **Spike C:** can each be read without storing the user's password (rule 5)? Which games have store-specific achievements that Steam doesn't already cover? Write the verdicts into PROVIDERS.md
- [ ] Epic provider, or documented as not supported
- [ ] Ubisoft Connect provider, or documented as not supported
- [ ] EA app provider, or documented as not supported (the likely verdict)
- **Exit:** each of the three is either a working provider with fixtures or a recorded "not supported" verdict

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
