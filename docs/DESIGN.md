# Design Document: Trophy Locker

## 1. Vision

One place to see every achievement and trophy you've ever earned, on any platform, and a satisfying pop-up the instant you earn a new one. Most players split their library across Steam, Xbox, PlayStation, Epic, Ubisoft, EA and emulators, and there is no single view of their progress. This app provides it.

## 2. Goals and non-goals

### Goals
- Unified library: every game, every achievement, one progress model
- Instant, non-intrusive unlock notifications, styled by rarity
- Runs in the background with negligible CPU/RAM impact
- Local-first: data and credentials stay on the user's machine
- Easy to extend with new platforms and emulators

### Non-goals (v1)
- Injecting overlays into game processes (anti-cheat risk)
- Cloud accounts, social features, or leaderboards
- Achievement unlocking/spoofing tools of any kind
- Mobile apps
- Guides/walkthrough content

## 3. Users

| Persona | Needs |
|---|---|
| **Completionist** | Cross-platform completion %, rarest achievements, what's left in each game |
| **Multi-platform player** | Same game on PS5 + Steam: one merged entry |
| **Emulation enthusiast** (after v1) | Trophies/achievements from RPCS3, RetroArch, etc., which have no official home |
| **Casual streamer** | Good-looking, configurable notification pop-up that shows in capture |

## 4. Core user flows

1. **First run:** Welcome, pick platforms, connect each account (OAuth / token paste / local path detect), initial sync with progress bar, land on Dashboard
2. **Background:** App lives in tray. Local watchers and pollers detect unlocks, and a toast appears
3. **Browse:** Dashboard, Library, Game detail, Achievement list with filters
4. **Settings:** Accounts, notifications, sync, startup, appearance

## 5. Screens

| Screen | Contents |
|---|---|
| **Dashboard** | Total unlocked, overall completion %, recent unlocks feed, rarest unlocked, "closest to 100%" games, per-platform breakdown |
| **Library** | Grid/list of games, platform badges, completion ring, search, sort (recent, %, name, platform), filter (platform; in progress, not started, completed), virtualized for large libraries |
| **Game detail** | Header art, per-platform tabs if linked, achievement list (locked/unlocked, rarity %, unlock date, description, hidden handling) |
| **Activity** | Chronological unlock timeline across all platforms |
| **Accounts** | Connected platforms, status (connected / needs re-auth / error), last sync, connect/disconnect |
| **Notification settings** | Position, monitor, duration, size, sound, per-platform toggles, rarity thresholds, preview button |
| **Settings** | Start with OS, minimize to tray, sync intervals, theme, data export, logs |
| **Tray menu** | Open, Sync now, Pause notifications (do-not-disturb), Recent unlocks submenu, Quit (Recent unlocks not built yet) |

## 6. Notification design

### Behavior
- Transparent, frameless, always-on-top, **click-through and non-focus-stealing** window, pre-created hidden at startup for instant display
- Slides in from a configurable corner, shows for N seconds (default 5), slides out
- Queue with de-dup: multiple simultaneous unlocks stack or sequence (max 3 visible), and a burst of more than 5 collapses to "N achievements unlocked"
- Content: achievement icon, title, description, game name, platform badge, rarity tier (with % of players), points (Gamerscore / trophy tier / Steam %)
- Rarity styling: Common, Uncommon, Rare, Ultra Rare, each with its own accent and sound
- Optional sound (custom file allowed), volume control
- **Do Not Disturb** mode (manual + optional "while in exclusive-fullscreen")

### Known limitation
Exclusive-fullscreen games render over normal windows. Mitigations:
1. Recommend borderless windowed (documented in onboarding)
2. Fallback: native OS toast notification (Windows Action Center) for when the overlay can't be shown
3. Missed toasts are always in the Activity feed

### First-sync rule
The first sync of a game establishes a **baseline**: existing unlocks are stored silently. Only unlocks that happen **after** baseline trigger pop-ups. This prevents a flood of hundreds of toasts on first connect.

## 7. Visual direction: "Afterglow"

Designed on the Superdesign canvas (see [design/README.md](design/README.md)). The tokens live in `src/renderer/src/styles/index.css`.

- **Floating cards on a midnight canvas.** No sidebar. Every surface is a rounded card lifted off the page by a hairline border, a soft drop shadow and a glow tinted by its game's art. Navigation is a floating "island" bar at the top of the window.
- **Game art is the interface, and it colours in.** A game's art is shown desaturated, with the full-colour art revealed up to its completion %, marked by a glowing lime edge. 100% is fully vivid with a gold crown. Completion is never shown as a ring.
- **One accent.** Lime (`#C4F542`) marks active navigation, primary actions, progress, toggles and focus. Gold is reserved for Ultra Rare and completed games.
- **Dark-first**, with a light theme as a later option.
- **The logo colours in too.** Trophy Locker's mark is a trophy with a keyhole through the cup, on a midnight aurora tile, filled with lime up to a glowing edge the way game art fills with completion ("Colour-in", chosen 2026-09-25 from four concepts on the canvas). Small sizes use simpler versions: no aurora or glow at 24–32px, and no keyhole at 16px. Files: `resources/` and `src/renderer/src/assets/logo.svg`.
- **Rarity is always a gem icon + a text label + the %:** Common (slate circle), Uncommon (mint diamond), Rare (sky hexagon), Ultra Rare (gold sparkle with a glow). Never colour alone (see §10).
- **Platform colours** appear only inside small circular platform badges (Steam blue, Xbox green, PlayStation blue, Epic grey, Ubisoft blue, EA red, emulator violet).
- **Type:** Bricolage Grotesque for titles and big numerals, Figtree for UI text, tabular figures for every count and percentage.
- **Shape:** generous radii (floating cards 26px, art 18px, buttons and inputs 14px, chips fully round).
- **Motion:** springy but quick. The colour-in edge sweeps in on load, the toast springs in and fades out, and everything respects the OS "reduce motion" setting.

Design work (mockups for Dashboard, Library, Game detail, Toast, Accounts, Notification settings, Onboarding) is tracked in [ROADMAP](ROADMAP.md) M0 and produced with Superdesign. Activity and the tray menu are not on the canvas; Activity was built without a mockup (M2), reusing the Dashboard's unlock rows under day headings.

## 8. Cross-platform game linking

The same game appears under different IDs on each platform. We maintain a **canonical game** with multiple **platform entries**:
- Auto-match by cleaned title (case, accents, ®/™, punctuation, PlayStation tags and edition words such as GOTY or Deluxe Edition ignored; "Remastered" and "Enhanced Edition" kept, so those stay separate), with merge ("Link another game…") and unlink on Game detail. Providers give no release year, so it is not used. Manual choices stick: auto-matching never moves a merged or unlinked entry. See the [design](superpowers/specs/2026-09-26-game-linking-design.md)
- Achievements are *not* merged across platforms (they differ per platform); the game detail page shows one tab per platform entry (the tabs double as the combined summary, each with its progress), and the Library card shows the best platform's completion with a badge per platform
- Steam-sourced games that are also sold on Epic/Ubisoft/EA are already covered via Steam, so those stores need no separate integration for those titles

## 9. Privacy & security

- Credentials/tokens stored in the OS keychain only
- No telemetry by default. Any future telemetry is opt-in.
- All network calls go directly from the user's machine to the platform, with no intermediary server
- Steam API key is the user's own (stored in keychain)
- Data export (JSON) and full local wipe in Settings

## 10. Accessibility

- Full keyboard navigation in the main window
- Respect reduced-motion and high-contrast OS settings
- Toast content also exposed as OS notification text for screen readers (when fallback enabled)
- Rarity is never conveyed by color alone (label + icon)

## 11. Decisions

These were open questions until 2026-09-21.

- **Platforms:** Windows only for v1. macOS and Linux may follow later.
- **Steam API key:** the user creates their own Steam Web API key and pastes it in. No server and no shared key, so nothing leaves the user's machine (see §9).
- **Hidden achievements:** show the name, and reveal the description only after the achievement is unlocked. To be confirmed against a real Steam response when the Steam provider is built (see [PROVIDERS.md](PROVIDERS.md)).
- **Licence:** GPL-3.0 (see the `LICENSE` file).
