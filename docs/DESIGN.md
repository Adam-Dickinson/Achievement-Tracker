# Design Document: Achievement Tracker

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
| **Emulation enthusiast** | Trophies/achievements from RPCS3, RetroArch, etc., which have no official home |
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
| **Library** | Grid/list of games, platform badges, completion ring, sort (recent, %, name, platform), filter (platform, completed, in-progress) |
| **Game detail** | Header art, per-platform tabs if linked, achievement list (locked/unlocked, rarity %, unlock date, description, hidden handling) |
| **Activity** | Chronological unlock timeline across all platforms |
| **Accounts** | Connected platforms, status (connected / needs re-auth / error), last sync, connect/disconnect |
| **Notification settings** | Position, monitor, duration, size, sound, per-platform toggles, rarity thresholds, preview button |
| **Settings** | Start with OS, minimize to tray, sync intervals, theme, data export, logs |
| **Tray menu** | Open, Sync now, Pause notifications (do-not-disturb), Recent unlocks submenu, Quit |

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

## 7. Visual direction (to be refined in design tool)

- Dark-first theme with a light option
- Trophy-case feel: game art forward, generous cards, rarity accent colors
- Platform colors used sparingly as badges only (Steam blue, Xbox green, PlayStation blue, Epic dark grey, Ubisoft blue, EA red, emulator purple)
- Type: a clean geometric sans for UI, tabular figures for counts and percentages
- Motion: subtle; rings animate on load, toast slide + fade, and respect OS "reduce motion"

Design work (mockups for Dashboard, Library, Game detail, Toast, Onboarding) is tracked in [ROADMAP](ROADMAP.md) M0 and can be produced with Superdesign.

## 8. Cross-platform game linking

The same game appears under different IDs on each platform. We maintain a **canonical game** with multiple **platform entries**:
- Auto-match by normalized title + release year, with manual merge/split UI
- Achievements are *not* merged across platforms (they differ per platform); the game detail page shows one tab per platform and a combined summary
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

## 11. Open questions

- Windows-only v1, or ship macOS/Linux builds early?
- Steam API key: ask the user to create one, or use OpenID + a shared key with a small proxy? (Leaning: user's own key, no server)
- Hidden achievement handling: reveal descriptions after unlock only?
- License choice (MIT / Apache-2.0 / GPL)
