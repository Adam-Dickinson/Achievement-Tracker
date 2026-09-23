# Roadmap

Ordering principle: **prove the riskiest, most valuable path end-to-end first** (Steam poll → DB → overlay toast), then widen.

## M0: Foundations and spikes (1-2 weeks)

- [x] Decide open questions in DESIGN.md §11 (license, OS scope, Steam key strategy): Windows only for v1, the user's own Steam key (no server), GPL-3.0, and hidden achievements show their name with the description revealed after unlock
- [x] Scaffold: Electron + TypeScript + React project per [ARCHITECTURE.md](ARCHITECTURE.md) §6. Verified: lint, typecheck, 27 tests and the production build pass, and the built app was run: window, IPC and SQLite schema, tray-driven close, single instance, and a click-through toast. `npm run dev` also verified
- [x] CI workflow written (`.github/workflows/ci.yml`); confirmed passing on GitHub Actions
- [x] Decide how main-process services are composed and shared: plain modules wired by hand in `src/main/index.ts`, no DI container ([ARCHITECTURE.md](ARCHITECTURE.md) §2)
- [~] **Spike A:** overlay window: transparent, click-through, no focus steal. Built and verified on Windows (window carries `WS_EX_TRANSPARENT` and `WS_EX_NOACTIVATE`; toast shown over a Steam window). Still to verify over a real borderless-windowed game and with multiple monitors / mixed DPI
- [ ] **Spike B:** RPCS3 trophy file format parse (fixture from real files)
- [ ] **Spike C:** feasibility notes for Xenia, Epic, Ubisoft, EA (write verdicts into PROVIDERS.md)
- [~] Mockups: Dashboard, Library, Game detail, Toast, Accounts, Notification settings, Onboarding are designed on the canvas in the "Afterglow" direction ([docs/design](design/README.md), [DESIGN.md](DESIGN.md) §7). Still to do: design Activity, and re-export the HTML snapshots in `docs/design/mockups/` (they still show the earlier look). The tray menu is a native Electron menu, so it needs no visual design
- **Exit:** scaffold builds in CI, overlay spike works, spike verdicts recorded

## M1: Vertical slice, Steam and toasts (MVP core)

- [x] Domain types + provider interface (`src/shared`); database + migration runner (`src/main/store`); `SecretStore` (`SafeStorageSecretStore`: encrypted with `safeStorage`, kept in `secrets.json`)
- [x] Sync engine: scheduler, diff, baseline rule, backoff with jitter, `UnlockEvent`. Built and tested: library scope (finds games, never forgets one), game scopes with tiered polling, and the baseline cutoff for games found later (ADR-0005)
- [~] Steam provider (Web API): library, schema, unlocks, rarity. Built, tested against captured replies, verified live against a real account, and registered with the Scheduler. The library includes games borrowed through Steam Families while they are in the two-week recently-played window. The Accounts screen connects an account: it checks the key with Steam, stores it in the `SecretStore` and starts syncing straight away
- [x] Notification service + overlay toast (queue, preview). Unlocks from the sync engine become toasts, up to 3 stacked on screen with the rest queued, duplicates dropped, more than 5 at once collapsed into one; the test notification goes through the same queue; Pause notifications in the tray. Sound moved to M4 (F-22 is P1)
- [x] Tray, close-to-tray, single instance, autostart. The tray menu has Pause notifications and Start with Windows; a login start stays in the tray. Start with Windows only works in the installed app, so it is checked for real once the installer exists (M6)
- [x] UI: Accounts (connect Steam), Library, Game detail, basic Dashboard. The Dashboard shows real totals, "Nearly there" and recent unlocks. Accounts is built for Steam (connect form, and an account list that updates itself as a sync finds games). Library (grid with colour-in covers, sort) and Game detail (tiles, filters, achievements rarest first) are built on real data and refresh as syncs land
- **Exit:** unlock a Steam achievement in a real game and a toast appears within the poll interval

## M2: Emulators and Xbox (P0 complete)

- [ ] RetroAchievements provider
- [ ] RPCS3 provider with file watcher (< 2 s latency)
- [ ] Steam local stats files (`appcache/stats/`): find borrowed Steam Families games last played more than two weeks ago, which the Web API can't list, and trigger an immediate poll on change. Format to verify
- [ ] Xbox provider (OAuth via browser/loopback redirect, token refresh)
- [ ] Running-game detection → fast polling
- [ ] Activity feed screen
- **Exit:** unlocks from Steam, Xbox, RA and RPCS3 all appear in one library and fire toasts

## M3: PlayStation and unified library

- [ ] PSN provider (NPSSO flow, opt-in warning)
- [ ] Cross-platform game linking (auto-match + manual merge/split)
- [ ] Dashboard stats (completion %, rarest, closest to 100%)
- [ ] Search/filter/sort, virtualized lists
- **Exit:** a game owned on two platforms shows as one entry with per-platform tabs

## M4: Polish and notification depth

- [ ] Notification settings (corner, monitor, scale, rarity styling, per-platform toggles)
- [ ] Toast sound per rarity tier, with volume and a mute (F-22)
- [ ] Native toast fallback, Do Not Disturb schedule (manual pause is in the tray already)
- [ ] Onboarding flow, empty/error states, provider health UI
- [ ] Accessibility pass, reduced motion, high contrast
- [ ] Data export, log viewer

## M5: Long-tail providers (spike-dependent)

- [ ] Xenia, Epic, Ubisoft, EA: implement or document as unsupported per M0 verdicts
- [ ] Generic local-file adapter

## M6: Release engineering

- [ ] Code signing, signed auto-update channel
- [ ] Installer (electron-builder, NSIS), code signing, signed auto-update; measure memory and size against N-02 / N-05
- [ ] Performance validation against N-01..N-07
- [ ] Crash reporting (opt-in), docs site/README screenshots
- [ ] v1.0.0

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Unofficial APIs (PSN, Xbox, Epic, Ubisoft, EA) break or are blocked | Provider outage | Isolation, clear "needs attention" state, fixtures, keep Steam/RA/local solid |
| Exclusive-fullscreen hides the overlay | Missed toasts | Native toast fallback, docs, Activity feed |
| Idle memory above the N-02 target | Not "lightweight" | Measured baseline ~170 MB private in the tray. Options: create the overlay on demand, disable GPU acceleration, trim dependencies; see ADR-0003 |
| Local file formats change with emulator updates | Parser breakage | Pinned fixtures, defensive parsing, version detection |
| ToS concerns for unofficial providers | Legal/ban risk for users | Opt-in with warnings, tokens only, no game injection |
| First-sync toast flood | Terrible UX | Baseline rule (F-16), burst collapsing |
