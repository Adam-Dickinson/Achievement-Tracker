# Roadmap

Ordering principle: **prove the riskiest, most valuable path end-to-end first** (Steam poll → DB → overlay toast), then widen.

## M0: Foundations and spikes (1-2 weeks)

- [ ] Decide open questions in DESIGN.md §11 (license, OS scope, Steam key strategy)
- [x] Scaffold: .NET solution (Core, Store, Providers, Sync, App, Tests) per [ARCHITECTURE.md](ARCHITECTURE.md) §6; build, 30 tests and a manual run of the app (tray, main window, click-through toast) verified locally
- [x] CI workflow written (`.github/workflows/ci.yml`); confirm it passes on first push
- [ ] Decide DI/hosting approach (`Microsoft.Extensions.Hosting`) and wire services into the App
- [~] **Spike A:** overlay window: transparent, click-through, no focus steal. Built and shown over a desktop app; still to verify over a real borderless-windowed game and on multi-monitor / mixed-DPI setups
- [ ] **Spike B:** RPCS3 trophy file format parse (fixture from real files)
- [ ] **Spike C:** feasibility notes for Xenia, Epic, Ubisoft, EA (write verdicts into PROVIDERS.md)
- [x] Mockups: Dashboard, Library, Game detail, Toast, Accounts, Notification settings, Onboarding ([docs/design](design/README.md)); Activity + tray menu still to design
- **Exit:** scaffold builds in CI, overlay spike works, spike verdicts recorded

## M1: Vertical slice, Steam and toasts (MVP core)

- [x] `Core` types + provider interface; `Store` with migration 0001 + runner; `ISecretStore` (in-memory; Windows Credential Manager implementation still to do)
- [ ] Sync engine: scheduler, diff, baseline rule, backoff, `UnlockEvent`
- [ ] Steam provider (Web API): library, schema, unlocks, rarity
- [ ] Notification service + overlay toast (queue, sound, preview)
- [ ] Tray, close-to-tray, single instance, autostart
- [ ] UI: Accounts (connect Steam), Library, Game detail, basic Dashboard
- **Exit:** unlock a Steam achievement in a real game and a toast appears within the poll interval

## M2: Emulators and Xbox (P0 complete)

- [ ] RetroAchievements provider
- [ ] RPCS3 provider with file watcher (< 2 s latency)
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
- [ ] Native toast fallback, Do Not Disturb (incl. schedule)
- [ ] Onboarding flow, empty/error states, provider health UI
- [ ] Accessibility pass, reduced motion, high contrast
- [ ] Data export, log viewer

## M5: Long-tail providers (spike-dependent)

- [ ] Xenia, Epic, Ubisoft, EA: implement or document as unsupported per M0 verdicts
- [ ] Generic local-file adapter

## M6: Release engineering

- [ ] Code signing, signed auto-update channel
- [ ] Installer (MSIX or Velopack), self-contained publish, measure memory against N-02
- [ ] Performance validation against N-01..N-07
- [ ] Crash reporting (opt-in), docs site/README screenshots
- [ ] v1.0.0

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Unofficial APIs (PSN, Xbox, Epic, Ubisoft, EA) break or are blocked | Provider outage | Isolation, clear "needs attention" state, fixtures, keep Steam/RA/local solid |
| Exclusive-fullscreen hides the overlay | Missed toasts | Native toast fallback, docs, Activity feed |
| Idle memory above the N-02 target | Not "lightweight" | Measure release builds early; trim, ReadyToRun, release the main window's visuals when hidden; see ADR-0002 |
| Local file formats change with emulator updates | Parser breakage | Pinned fixtures, defensive parsing, version detection |
| ToS concerns for unofficial providers | Legal/ban risk for users | Opt-in with warnings, tokens only, no game injection |
| First-sync toast flood | Terrible UX | Baseline rule (F-16), burst collapsing |
