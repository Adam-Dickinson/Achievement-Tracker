# Onboarding, empty states and provider health: design

- **Date:** 2026-09-28
- **Roadmap:** M5, "Onboarding flow, empty/error states, provider health UI" (also closes M5b's "Emulators step in onboarding")
- **Status:** approved in conversation

## Goal

Three related gaps, from checking the app against its own screens:

1. There is no onboarding flow at all. `App.tsx` always renders the nav and Dashboard, whether or not any account is connected — a fresh install drops straight into an empty app with no guidance.
2. Dashboard has no empty state: with zero accounts it silently renders a hero and rarest-unlock card full of zeros. Library and Activity already have one each (plain text, no call to action), found while checking this item.
3. "Provider health UI" turns out to already exist: Accounts/`AccountCard` shows per-account status badges, sync progress and reauth banners, and the island nav's sync status already flags "Check accounts" when one needs attention (built across M4/M5). This item needs no new code for that part — see "Provider health UI" below for the verdict, not a design.

## Decisions

| Question | Choice |
|---|---|
| What triggers onboarding? | **First launch only, persisted forever.** A new `onboarding.completed` setting. Connecting an account or pressing "Skip setup" sets it; it never shows again, even if every account is later disconnected — that case is Dashboard/Library/Activity's empty state instead |
| How many steps? | **3: Welcome → Platforms → Done.** The mockup's 4-step version has a blocking "First sync" progress screen; dropped because the rest of the app already treats syncing as async and live-updating (Accounts already shows per-account first-sync progress), and blocking on hundreds of games (a Steam family library) would feel slow |
| How does the Platforms step connect accounts? | **Reuses `ConnectPrompt`/`ConnectFlow` from `features/accounts/` unmodified.** Every sign-in flow (Steam's key form, the Xbox/Epic/Ubisoft/EA/PlayStation sign-in windows, shadPS4's folder picker) already exists and is tested; onboarding lays the same components out in the wizard's grid instead of the Accounts screen's card list. This is also how M5b's "Emulators step in onboarding" is closed: shadPS4 is just another tile in the same grid |
| Empty states | A shared `EmptyState` component (icon, heading, body, "Connect a platform" button). Dashboard gets one where it has none today; Library and Activity's existing plain-text versions are upgraded to use it, same trigger logic they already have |
| Provider health UI | **No new work.** Already built: `AccountCard`'s status badges (`connected`/`needs_reauth`/`error`/`disabled`), its sync-progress bar and reauth/disabled notes, the Accounts summary tiles, and the nav's "Check accounts" sync-status state |

## 1. Trigger: `onboarding.completed`

A new key in the `setting` table (`settings-store.ts`), same read/save pattern as `profile.name`:

```ts
function readOnboardingCompleted(db: DatabaseSync): boolean
function saveOnboardingCompleted(db: DatabaseSync): void // no un-set: one-way
```

`App.tsx` reads it once at startup, the same way it already reads `profile` via `useProfile()`. While it is `false` **and** no account is connected (`useAccounts()`, already used by the Accounts screen), `App` renders `Onboarding` instead of the nav + `PageContent` tree — no router, no history stack, just one piece of state:

```tsx
const { accounts } = useAccounts()
const { completed, complete } = useOnboarding()
const showOnboarding = completed === false && accounts?.length === 0

if (showOnboarding) return <Onboarding onDone={complete} />
```

`complete()` calls the new `completeOnboarding` IPC channel (`shared/ipc.ts` → `main/ipc.ts` → `preload/index.ts`, per the repo's recipe A) which calls `saveOnboardingCompleted`. Both `accounts === null` (still loading) and `completed === null` (still loading) must resolve before the check runs, or a fresh install would flash the normal (empty) app before onboarding appears; `Onboarding` is only shown once both are loaded and agree.

## 2. The three steps

New folder `features/onboarding/`, one component per step, driven by a `step: 'welcome' | 'platforms' | 'done'` state in `Onboarding.tsx`. `Onboarding.tsx` renders a persistent header (logo + "Skip setup", matching the mockup) and step indicator around whichever step is current; "Skip setup" is visible on every step and always calls `onDone()` directly.

- **`WelcomeStep`**: static — logo mark, one-line pitch, "Get started" button that advances to Platforms.
- **`PlatformsStep`**: a grid of platform tiles for the six `ONLINE_PLATFORMS` plus `shadps4` (RPCS3 stays out — ADR-0015 has no real provider for it yet). Each tile is the existing `ConnectPrompt` (online platforms) or a new thin wrapper around the existing shadPS4 connect flow (`ShadPs4Card`'s connect UI, not its "already connected" card). A footer bar matches the mockup: Back, "N platforms selected", and Continue — **Continue is disabled until at least one account is connected** (the header's "Skip setup" is how you leave with zero).
- **`DoneStep`**: confirms N accounts connected ("Steam and 2 more are syncing in the background"), one button ("Go to Dashboard") that calls `onDone()`.

`Onboarding.tsx` and its steps hold no sign-in logic themselves — every IPC call and piece of state (loading, errors, cancellation) already lives inside `ConnectPrompt`/`ConnectFlow`/the shadPS4 connect UI and is reused as-is.

## 3. Empty states

New `components/EmptyState.tsx`:

```tsx
interface EmptyStateProps {
  icon: ReactNode
  heading: string
  body: string
  onNavigate: () => void
  cta: string
}
```

Renders an icon tile, heading, body text and a button calling `onNavigate`. Used:

- **Dashboard** (new): shown instead of `DashboardContent` when `stats.platforms.length === 0 && stats.recentUnlocks.length === 0` (no direct account count on `DashboardStats`, so this mirrors Library's existing "no data at all" convention rather than adding a new field). CTA navigates to Accounts.
- **Library** (upgrade): same `games.length === 0` check it already has, now rendering `EmptyState` instead of a plain `<p>`.
- **Activity** (upgrade): same `page.unlocks.length === 0` check it already has, same swap.

Game detail already handles a missing/unknown game (`role="status"` branches at lines 81, 214, 219) — no change needed there.

## 4. Provider health UI: verdict, not a design

Already built and not touched by this work:

- `AccountCard`'s `STATUS` map (connected/needs_reauth/error/disabled badges) and `SyncNote` (reauth banner, disabled note, first-sync progress bar).
- `Accounts`'s summary tiles (connected / needs signing in / available).
- The island nav's sync status ("Check accounts" when an account needs attention).

This closes that part of the roadmap item with no new code.

## 5. Tests

- `settings-store.test.ts`: read/save for `onboarding.completed`, same shape as the `profile.name` tests.
- `ipc.test.ts`: the new `completeOnboarding` channel is trusted-sender-checked like the others.
- `features/onboarding/*.test.tsx`: each step renders and transitions correctly; Skip and "Go to Dashboard" both call `onDone`; connecting an account in `PlatformsStep` reuses `ConnectPrompt`'s existing tested behaviour (no new sign-in-flow tests needed).
- `App.test.tsx` (new, or extended if one exists): onboarding shows when `completed` is false and there are zero accounts; hidden once either is true; hidden while either is still loading.
- `EmptyState.test.tsx`: renders icon/heading/body/CTA; CTA click calls `onNavigate`.
- `Dashboard.test.tsx` / `Library.test.tsx` / `Activity.test.tsx`: extend the existing empty-state assertions to check `EmptyState` renders (heading text, CTA present) instead of the old plain paragraph.

## Docs to update when built

SPEC.md (new IPC channel, the `onboarding.completed` setting), ARCHITECTURE.md (if the onboarding gate changes how `App.tsx`'s composition is described), PROJECT-MAP.md (new `features/onboarding/` folder, `EmptyState.tsx`), ROADMAP.md (tick the M5 item and the M5b "Emulators step in onboarding" item), CLAUDE.md status paragraph.
