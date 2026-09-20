# Design System: Achievement Tracker

## Product context
Desktop app (Windows first, native window ~1440x900, min 1024x680) that unifies achievements/trophies from Steam, Xbox, PlayStation, Epic, Ubisoft, EA, and emulators (RetroAchievements, RPCS3, Xenia). Lives in the system tray and shows an in-game-style toast when an achievement unlocks.

Jobs to be done: see all progress in one place; know instantly when I unlocked something; find what's left to complete; merge the same game across platforms.

### Key screens
Dashboard, Library, Game detail (per-platform tabs), Activity timeline, Accounts (connect platforms), Notification settings, Onboarding, and the **Unlock toast** (a small overlay that appears over games).

### App shell
Fixed left sidebar (240px, collapsible to 72px icon rail): logo, nav (Dashboard, Library, Activity, Accounts, Settings), footer with sync status ("Synced 2 min ago" + spinner state) and Do-Not-Disturb toggle. Top bar in content area: page title, global search (Ctrl+K), Sync now button. Content max width 1280px with 32px gutters.

## Visual direction
Dark-first "trophy case": deep ink backgrounds, game art forward, generous rounded cards, warm gold used for prestige and primary actions. Feels premium and game-adjacent without neon or gimmicks. Calm and information-dense, never cluttered.

## Color (dark theme, default)
| Token | Value | Use |
|---|---|---|
| bg-base | #0B0D12 | app background |
| surface-1 | #12151C | sidebar, cards |
| surface-2 | #181C25 | raised cards, inputs |
| surface-3 | #1F2430 | hover, selected rows |
| border | #262C3A | 1px dividers/card borders |
| text | #E8EAF0 | primary text |
| text-muted | #8B93A7 | secondary text |
| text-subtle | #5B6478 | tertiary, placeholders |
| primary (gold) | #F5B942 | primary buttons, active nav indicator, key progress |
| primary-hover | #FFCB5C | |
| on-primary | #1A1300 | text on gold |
| success | #3FB984 | connected, synced |
| warning | #F2A33A | needs attention |
| danger | #F0616D | errors, disconnect |
| info | #4C9BFF | links, info |

Light theme (secondary): bg #F6F7FA, surface #FFFFFF, border #E3E6EE, text #14171F, muted #5A6275, primary #D9960F (on-primary #FFFFFF).

### Rarity tiers (always paired with a text label AND icon, never color alone)
| Tier | Color | Threshold (global % of players) |
|---|---|---|
| Common | #9AA3B5 | > 30% |
| Uncommon | #3FB984 | 10-30% |
| Rare | #4C9BFF | 2-10% |
| Ultra Rare | gradient #FFD36B → #F5A524 + soft gold glow | < 2% |

### Platform badges (small pill, 20px tall, icon + short label; used ONLY as badges, never as page theme)
Steam #66C0F4, Xbox #52B043, PlayStation #3B82F6-ish #0070D1, Epic #D4D4D8, Ubisoft #3D8BFF, EA #FF5A5A, Emulator #A78BFA. Badge background = color at 14% opacity, text/icon = full color.

## Typography
- **UI font: Inter** (weights 400, 500, 600, 700). `font-variant-numeric: tabular-nums` for all counts, percentages, times.
- **Display font: Space Grotesk** (600/700) for big stat numbers and page titles only.
- Scale: display 40/44, h1 28/34, h2 20/28, h3 16/24 (600), body 14/22, small 12/18, micro 11/16 uppercase tracking +0.06em for section labels.

## Spacing, shape, elevation
- 4px base unit; common gaps 8/12/16/24/32
- Radius: 8 (inputs, buttons), 12 (cards), 16 (large panels, toast), 999 (pills, badges)
- Borders: 1px solid border token. Cards: surface-1 + border, no heavy shadow.
- Shadows (dark): card none; popovers `0 8px 24px rgba(0,0,0,.45)`; toast `0 12px 40px rgba(0,0,0,.55)` plus rarity glow.

## Components
- **Button:** primary (gold bg, on-primary text, 36px tall, radius 8, 600), secondary (surface-2 + border), ghost (transparent, hover surface-3). Icon buttons 36x36.
- **Progress ring:** 56px (cards) / 120px (hero); track = surface-3, stroke = gold (100% = success green with check); percentage centered in Space Grotesk.
- **Progress bar:** 6px tall, radius 999, gold fill.
- **Game card:** cover art 2:3 (or 16:9 header variant), title, platform badges row, completion ring/bar, "12 / 40" tabular count. Hover lifts 2px, border brightens.
- **Achievement row:** 56px icon (rounded 8; locked = grayscale 60% + lock glyph), name (600), description (muted), right side: rarity pill + % of players + unlock date. Hidden achievements show "Hidden achievement" until unlocked.
- **Stat tile:** micro label, Space Grotesk value, small delta/subtext.
- **Tabs / segmented control** for per-platform tabs on Game detail (each tab shows platform badge + count).
- **Toggle, select, slider, text input:** surface-2 fill, 1px border, gold focus ring (2px, offset 2px).
- **Status pill:** connected (green), needs re-auth (amber), error (red), each with dot + label.
- **Empty state:** centered illustration-free icon in surface-2 circle, title, one-line help, primary CTA.

## Unlock toast (overlay component)
Standalone 380x96 card, radius 16, surface-2 at 96% opacity with 1px rarity-colored border and outer rarity glow. Left: 64px achievement icon with rarity ring. Middle: micro label "ACHIEVEMENT UNLOCKED" (rarity color), title (600, 16px), description (muted, 12px, 1 line clip), footer row: game name · platform badge · points. Right: rarity pill + "3.2% of players". Ultra Rare gets a subtle gold shimmer sweep once. Designed on a transparent/game-screenshot backdrop. Slides in from the bottom-right corner.

## Motion
150-200ms ease-out for hover/press; rings animate from 0 on load (600ms); toast slide 260ms cubic-bezier(.2,.8,.2,1), hold 5s, fade out 200ms. Respect prefers-reduced-motion (fade only).

## Iconography
Lucide-style outline icons, 1.75px stroke, 20px in nav, 16px inline. Trophy, layout-dashboard, library, activity, plug, settings, search, refresh-cw, bell-off.

## Content tone
Concise and confident. Sentence case. Numbers are always visible and precise.

## Hard rules for generated designs
- Use ONLY the fonts, colors, spacing and component styles above. No other fonts, no purple/pink gradients (purple is reserved for the Emulator badge), no glassmorphism blur cards, no emoji as icons.
- Platform colors appear only inside badges.
- Rarity is always labelled in text.
- Use realistic placeholder data: games like Elden Ring, Hades, God of War, Forza Horizon 5, Celeste, Stardew Valley, Hollow Knight, Persona 5 Royal; achievements with plausible names and percentages.
