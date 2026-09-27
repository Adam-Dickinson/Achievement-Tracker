# Roadmap

Ordering principle: **prove the riskiest, most valuable path end-to-end first** (Steam poll → DB → overlay toast), then widen.

## M0: Foundations and spikes (1-2 weeks)

- [x] Decide open questions in DESIGN.md §11 (license, OS scope, Steam key strategy): Windows only for v1, the user's own Steam key (no server), GPL-3.0, and hidden achievements show their name with the description revealed after unlock
- [x] Scaffold: Electron + TypeScript + React project per [ARCHITECTURE.md](ARCHITECTURE.md) §6. Verified: lint, typecheck, 27 tests and the production build pass, and the built app was run: window, IPC and SQLite schema, tray-driven close, single instance, and a click-through toast. `npm run dev` also verified
- [x] CI workflow written (`.github/workflows/ci.yml`); confirmed passing on GitHub Actions
- [x] Decide how main-process services are composed and shared: plain modules wired by hand in `src/main/index.ts`, no DI container ([ARCHITECTURE.md](ARCHITECTURE.md) §2)
- [~] **Spike A:** overlay window: transparent, click-through, no focus steal. Built and verified on Windows (window carries `WS_EX_TRANSPARENT` and `WS_EX_NOACTIVATE`; toast shown over a Steam window). Multiple monitors verified 2026-09-27 with two 2560×1440 screens at 100%, the primary on the right: with the main window on the other screen, the toast appeared at the primary screen's bottom-right corner above the taskbar, over Chrome, and Chrome kept the focus. Still to verify over a real borderless-windowed game, and on screens with different scaling (mixed DPI)
- Spike B (RPCS3 trophy files) moved to After v1 and Spike C (Epic, Ubisoft, EA) to M4 ([ADR-0006](adr/0006-v1-provider-scope.md))
- [x] Mockups: Dashboard, Library, Game detail, Toast, Accounts, Notification settings, Onboarding and Activity are designed on the canvas in the "Afterglow" direction ([docs/design](design/README.md), [DESIGN.md](DESIGN.md) §7), and the HTML snapshots in `docs/design/mockups/` were re-exported from it on 2026-09-27 under the Trophy Locker name. The tray menu is a native Electron menu, so it needs no visual design
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

- [ ] Near real-time Steam toasts (a toast seconds after an unlock, not up to 5 minutes). Two signals and the unlocks themselves, all from Steam's own files and registry, never from the game (rule 4); see PROVIDERS.md, Steam, "Local files and plan". All built; the item is done once a real unlock shows a delay of seconds:
  - [x] Steam local stats files (`appcache/stats/UserGameStats_<accountid>_<appid>.bin`): watch the folder and sync that one game straight away when its file changes (`SteamProvider.watch()`, `Scheduler.syncGameNow()`). A game the library doesn't list yet triggers one library look first
  - [x] Borrowed Steam Families games last played more than two weeks ago, and never-played ones: the whole family library through an opt-in Steam sign-in ([ADR-0011](adr/0011-steam-family-library.md)), which is now also how Steam connects (one sign-in reads the Web API key; the key form stays as a fallback); every shareable family game with achievements is added (215 for the owner), synced with the Web API key; verified live: the owner connected Steam with one sign-in and got 386 Steam games (171 owned + 215 family), all first syncs silent
  - [x] Running-game detection (Steam's `RunningAppID` registry value) → fast polling (every 30 s) of the game being played, as a safety net for a missed file write; a game not played lately is checked the moment it launches instead of up to 6 hours later. Verified live: `RunningAppID` holds the appid while a game runs
  - [x] Timing from real unlocks: three Steam unlocks on 25-26 September (The Last of Us Part I, with the watch running) were found **70, 71 and 153 s** after they happened. Either local signal would have synced within 30 s, so the Web API itself reports an unlock about a minute late; watching alone can't make a toast arrive within seconds
  - [x] Unlocks read from Steam's own stats file: `UserGameStats_<accountid>_<appid>.bin` holds every unlocked achievement and its time, and `UserGameStatsSchema_<appid>.bin` names them. Syncing a Steam game now also reads these two files and adds any unlock the Web API doesn't report yet, so a file change leads straight to a toast. Checked against all 183 of the owner's stats files: every one read, and 1,412 local unlocks matched the Web API one for one, 1,397 of them within 2 s (the rest earlier locally, by up to 25 minutes)
  - [ ] One more real unlock to confirm Steam writes the file at the moment of the unlock (the unlock timing line in the `npm run dev` terminal should now show a few seconds)
- [x] Xbox provider (OAuth via browser/loopback redirect, token refresh). Verified against a real account and built: the provider, the scheduler's credential refresh (ADR-0007), the sign-in in the main process, and the Xbox card on the Accounts screen with the "unofficial" opt-in; a live run fetched all 13 games of a real library
- [x] Activity feed screen: every dated unlock across platforms, newest first, grouped under day headings, with description, game, platform, rarity and time; "Show more" loads 50 more (up to 1,000); refreshes as syncs land; a row opens its game. Built without a canvas design, in the Afterglow style of the Dashboard's recent unlocks
- **Exit:** unlocks from Steam and Xbox appear in one library and fire toasts; a Steam unlock toasts within seconds

## M3: Epic, Ubisoft and EA (spike first)

Moved ahead of PlayStation at the owner's request ([ADR-0008](adr/0008-stores-before-playstation.md)).

- [x] **Spike C:** can each be read without storing the user's password (rule 5)? Which games have store-specific achievements that Steam doesn't already cover? Write the verdicts into PROVIDERS.md. **Epic: feasible** (2026-09-25; unofficial, the launcher's own services, signed in with a code from the browser). **Ubisoft: feasible** (2026-09-25; unofficial, the launcher's own services, signed in on Ubisoft's page in an app window, [ADR-0009](adr/0009-ubisoft-sign-in-window.md)). **EA: feasible** (2026-09-25; unofficial, the EA app's own services, signed in on EA's page in an app window, then its session cookies traded for tokens)
- [x] Epic provider, or documented as not supported. Built and verified live against a real account: the provider (sign-in with a pasted code, refresh-token rotation, library filtered to games with Epic achievements, catalog titles and covers, rarity, unlock dates), registered with the Scheduler, `connectEpic`/`openEpicSignIn` over IPC, and the Connect Epic card on the Accounts screen; a real account connected from the app
- [x] Ubisoft Connect provider, or documented as not supported. Built and verified live: the provider (remember-me tickets traded for launcher sessions, renewed one at a time and only when the Scheduler refreshes, games with Ubisoft achievements in one query, unlock dates, no rarity), the sign-in window, registered with the Scheduler, `connectUbisoft`/`cancelUbisoftSignIn` over IPC, and the Connect Ubisoft card on the Accounts screen; a real account connected from the app (10 games, 79 unlocks, a silent first sync)
- [x] EA app provider, or documented as not supported. Built and verified live: the provider (EA's session cookies traded for 4-hour tokens, rotated `remid` saved, one renewal at a time), the sign-in window with its `ea.com`-only navigation rule ([ADR-0010](adr/0010-ea-sign-in-window.md)), registered with the Scheduler, `connectEa`/`cancelEaSignIn` over IPC, and the Connect EA card on the Accounts screen; a real account connected from the app (12 games, all with covers, 454 achievements, 39 unlocks, a silent first sync)
- **Exit:** each of the three is either a working provider with fixtures or a recorded "not supported" verdict

## M4: PlayStation and unified library (P0 complete)

- [x] PSN provider (NPSSO flow, opt-in warning). Built and verified live: the provider (Sony's sign-in page in an app window, the 60-day `npsso` cookie minting 10-day refresh tokens per [ADR-0012](adr/0012-playstation-sign-in-npsso.md), every trophy list including PS3 and Vita, tiers, global rarity, unlock dates), registered with the Scheduler, `connectPlayStation`/`cancelPlayStationSignIn` over IPC, and the Connect PlayStation card on the Accounts screen with the "unofficial" opt-in; a real account connected from the app (100 games, 5,002 trophies, 687 unlocks matching PSN's own count, a silent first sync)
- [x] Cross-platform game linking (auto-match + manual merge/split). Built: games with the same cleaned title share one Library card (best platform's completion, a badge per platform) and Game detail has a tab per platform, "Link another game…" (search) and "Unlink"; merges and unlinks stick; migration 0003 and a regroup at startup. On the owner's library, 568 entries became 516 games with 43 linked
- [x] Artwork for every game. Linking borrows a linked copy's cover (4 coverless games became 3), and a game with no art gets a generated Afterglow cover (the title on a gradient picked from the title, coloured in up to its completion like real art), so every card has an image. Store lookups were spiked and dropped: Epic's store and Steam's store search would fix only Europa Universalis IV (see PROVIDERS.md, Epic). "yorkie Production" is Football Manager 2024, but neither store still sells it. Then: Steam covers now come from Steam's store assets (23 newer games had dead header links), and games still without art get it from **SteamGridDB** when the user adds their own key in Settings → Artwork ([ADR-0013](adr/0013-steamgriddb-artwork.md)); on the owner's library that left one generated cover ("yorkie Production"). Original plan: Today 4 of 231 games have no cover, all Epic games whose catalog entry is empty. In order: borrow the cover of a linked copy on another platform; otherwise look the game up on the Steam store by title (a public search with no key; verify it first, rule 10); as a last resort, generate an Afterglow-style cover (the title on a gradient) so no card is blank. Also find the real title for Epic games whose catalog is empty and whose library name is a codename (for example "yorkie Production")
- [x] Dashboard stats (completion %, rarest, closest to 100%). Built: the completion hero and "Nearly there" (closest to 100%) were already there; added "Platforms" (completion, achievements and games per platform) and "Rarest unlocked" (the five held achievements the fewest players have). Checked in the built app on the owner's data: six platforms, the rarest at 0.1%
- [x] Search/filter/sort, virtualized lists. Built ([ADR-0014](adr/0014-virtualized-lists-client-side-filtering.md)): the Library has a search (every word, ignoring case and accents), platform and progress filters with live counts, and a Last unlock / Completion / Name / Platform sort, kept when a game is opened and its scroll position restored on the way back; Game detail adds a search over names and descriptions (never revealing hidden achievements) and a Rarest / Latest unlocked / Name sort. Both lists are virtualized (`VirtualGrid`). Checked in the built app on the owner's data: about 25 of 516 cards and 10 to 26 of PAYDAY 2's 1,342 achievements rendered at a time. Not done: one search across every game's achievements (F-31 also covers that); Activity keeps its "Show more" paging
- [x] The P0 account and sync controls no milestone owned (found when checking M0-M4 on 2026-09-26): **Disconnect** an account (F-01), keeping its games or removing them; **Sync now** for everything (Accounts and the tray), one account and one game (F-14), forcing a sync past the idle interval and any backoff; and **progress** during an account's first sync (F-10: "Syncing… 120 of 386 games read") with the last successful sync otherwise, plus a hint on how to reconnect a signed-out account (part of F-03). Checked in the built app on a copy of the owner's data: disconnecting and keeping the games left all 516 in the Library
- **Exit:** a game owned on two platforms shows as one entry with per-platform tabs, and every game in the Library has an image

## M5: Polish and notification depth

- [ ] **Match the Afterglow designs** (the canvas and `docs/design/mockups/`; the owner wants the app to look like them). The style is in place; these layouts are not:
  - [x] Whole app: the aurora background behind every page, and the island nav in frosted glass with its search box (Ctrl+K; typing opens the Library filtered), sync status ("Synced 2m ago", click to sync everything; "Check accounts" when one is signed out), notifications bell (pauses notifications, in step with the tray) and avatar (the Windows user's initial). The version moved to Settings, beside "Send test toast". Below 1280px wide the page pills show only their icons. Checked in the built app on a copy of the owner's data. The design's "Overview" label stays "Dashboard"
  - [x] Dashboard: rebuilt to the design (hero with the unlocked count, today / this week / streak chips, "By rarity" counts and fanned "Nearly there" covers; the rarest unlock as a spotlight card; "Recent unlocks" beside "Platforms" and a "This week" chart; platform logo badges). Exactly as designed at the owner's request, so the Completed games and Platinums tiles and the list of five rarest unlocks are gone. Checked in the built app on a copy of the owner's data
  - [x] Dashboard counts each game once: the totals and "By rarity" use a game's best copy only, and the day chips count an achievement unlocked on several copies once (the owner plays one copy of a game, and Ubisoft Connect mirrors Steam unlocks)
  - [x] Library: built to the design: the profile card (the profile name, set in Settings, else the Windows name; achievements, games, average completion, the overall bar, and unlocks per rarity), the toolbar (platform chips with badges, Progress and Sort dropdowns, the Landscape / Portrait / List switch) and the staggered grid. The page's own search box went: the nav's search is the Library's. The List view (cover, progress bar, counts, %, last unlock) and the Portrait view have no canvas design and follow the Afterglow style. Checked in the built app on a copy of the owner's data
  - [ ] Tall art for the Portrait view: it frames each game's landscape cover for now. Store a portrait image per platform entry where the platform has one (Steam's `library_600x900`, Epic's `DieselGameBoxTall`, Xbox's `Poster`/`BoxArt`, SteamGridDB 600x900 grids), each verified first (rule 10)
  - [ ] Game detail: "Open in Steam" (and the other stores)
  - [ ] Activity: the header card (this week's count, streak, rarest unlock, rarity legend)
  - [ ] Accounts: one card per platform with its status, stats, Resync and Disconnect, in place of the connect forms and the account list
  - [ ] Toast: the platform badge
  - Settings and Onboarding are designed too; they are built to their designs in the items below
- [ ] Notification settings (corner, monitor, scale, rarity styling, per-platform toggles)
- [ ] Toast sound per rarity tier, with volume and a mute (F-22)
- [ ] Native toast fallback, Do Not Disturb schedule (manual pause is in the tray already)
- [ ] Onboarding flow, empty/error states, provider health UI
- [ ] Accessibility pass, reduced motion, high contrast
- [ ] Data export, log viewer
- [x] Platinums (F-35, [design](superpowers/specs/2026-09-27-platinum-design.md)): a game's own "unlock everything" achievement counts as its platinum (40 Steam and Xbox games in the owner's library, found from the description), and a game without one earns an app-awarded Platinum at 100%. Shown as a banner on each Game detail tab, a chip on platinum achievements and unlocks, Activity lines and platinum toasts. Checked in the built app on a copy of the owner's data: all 15 finished games got a platinum (10 their own, 5 app-awarded, silently at startup)

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
