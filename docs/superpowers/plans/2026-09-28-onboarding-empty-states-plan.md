# Onboarding, Empty States and Provider Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Trophy Locker's first-launch onboarding wizard, give Dashboard/Library/Activity a real "nothing here yet" empty state that points at Accounts, and close the M5 roadmap item (provider health UI needs no new code — it already exists).

**Architecture:** A new `onboarding.completed` setting (same key→JSON pattern as `profile.name`) gates a new `Onboarding` component rendered by `App.tsx` in place of the normal nav+page shell. The wizard's Platforms step reuses the existing, already-tested `ConnectPrompt`/`ShadPs4Card` components from `features/accounts/` unmodified — no new sign-in logic anywhere. A shared `EmptyState` component gives Dashboard a state it never had, and upgrades Library/Activity's existing plain-text empty paragraphs to match.

**Tech Stack:** Electron + TypeScript (main/preload/shared, CommonJS), React 19 (renderer), Tailwind v4 design tokens, Vitest + Testing Library, zod for IPC input validation.

**Spec:** [docs/superpowers/specs/2026-09-28-onboarding-design.md](../specs/2026-09-28-onboarding-design.md)

## Global Constraints

- No code comments anywhere (CLAUDE.md style rule) — explanations belong in this plan and the docs, not the code.
- New IPC capabilities go `shared/ipc.ts` → `main/ipc.ts` → `preload/index.ts` → wired in `main/index.ts` (CLAUDE.md rule 9, recipe A in PROJECT-MAP.md); every handler checks `isTrustedSender(event)` first.
- The Platforms step must render the existing `ConnectPrompt` (online platforms) and `ShadPs4Card` (shadPS4) components **unmodified** — all sign-in logic, IPC calls and error handling already exist and are tested there.
- TypeScript strict, no `any`; Prettier formatting (no semicolons, single quotes); ESLint must pass with zero warnings.
- Tests are written by Claude (CLAUDE.md, "Tests are written by Claude"): every task adds or updates tests beside the code, following this repo's existing conventions exactly (`// @vitest-environment jsdom` pragma, `@testing-library/react`, `fakeApi` from `@/test/fake-api`, role-based queries).
- `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm test` must all pass before any commit in this plan's final task; run the affected file's tests after every step that changes code.
- One feature branch + one PR for this whole plan (repo convention), branched from `main`.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Create and switch to the feature branch**

```bash
git checkout main
git pull
git checkout -b feature/onboarding
```

---

### Task 1: The `onboarding.completed` setting

**Files:**
- Modify: `src/main/store/settings-store.ts`
- Test: `src/main/store/settings-store.test.ts`

**Interfaces:**
- Produces: `readOnboardingCompleted(db: DatabaseSync): boolean`, `saveOnboardingCompleted(db: DatabaseSync): void`, both exported from `src/main/store/settings-store.ts`. No schema migration needed — the `setting` key→JSON table already exists (migration `0001_init.sql`).

- [ ] **Step 1: Write the failing tests**

Add to `src/main/store/settings-store.test.ts`, after the `notification settings` describe block (import `readOnboardingCompleted, saveOnboardingCompleted` alongside the existing imports from `./settings-store`):

```ts
describe('onboarding completed setting', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    applyMigrations(db)
  })

  it('has not been completed until it is saved', () => {
    expect(readOnboardingCompleted(db)).toBe(false)
  })

  it('is completed once saved, and stays that way', () => {
    saveOnboardingCompleted(db)

    expect(readOnboardingCompleted(db)).toBe(true)
  })

  it('stores it as JSON in the setting table', () => {
    saveOnboardingCompleted(db)

    expect(db.prepare('SELECT key, value FROM setting').all()).toEqual([
      { key: 'onboarding.completed', value: 'true' },
    ])
  })

  it('treats a corrupt stored value as not completed', () => {
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run(
      'onboarding.completed',
      'not json',
    )

    expect(readOnboardingCompleted(db)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/store/settings-store.test.ts`
Expected: FAIL — `readOnboardingCompleted`/`saveOnboardingCompleted` are not exported from `./settings-store`.

- [ ] **Step 3: Implement**

In `src/main/store/settings-store.ts`, add a new key constant beside the existing two and the two functions at the end of the file:

```ts
const ONBOARDING_COMPLETED = 'onboarding.completed'
```

```ts
export function readOnboardingCompleted(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(ONBOARDING_COMPLETED) as
    { value: string } | undefined
  if (!row) return false
  try {
    return JSON.parse(row.value) === true
  } catch {
    return false
  }
}

export function saveOnboardingCompleted(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(ONBOARDING_COMPLETED, JSON.stringify(true))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/store/settings-store.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/main/store/settings-store.ts src/main/store/settings-store.test.ts
git commit -m "Add the onboarding.completed setting"
```

---

### Task 2: IPC channel — `getOnboardingCompleted` / `completeOnboarding`

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/ipc.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/test/fake-api.ts`

**Interfaces:**
- Consumes: `readOnboardingCompleted`, `saveOnboardingCompleted` from Task 1.
- Produces: `window.api.getOnboardingCompleted(): Promise<boolean>` and `window.api.completeOnboarding(): Promise<void>`, callable from the renderer from this task on. `fakeApi()` defaults `getOnboardingCompleted` to `true` (resolved) so every existing renderer test — which never connects an account before assertions — keeps rendering the normal app, not onboarding.

- [ ] **Step 1: Write the failing test**

Add to `src/main/ipc.test.ts`: add `getOnboardingCompleted: vi.fn(() => false)` and `completeOnboarding: vi.fn()` to the `fakes` object, right after the existing `setProfileName: vi.fn((name: string | null) => ({ ...PROFILE, name }))` entry (before `getNotificationsPaused`), add `IPC.getOnboardingCompleted` and `IPC.completeOnboarding` to the `it.each([...])` untrusted-sender list (after `IPC.setProfileName`), and add a new describe block after the `registerIpcHandlers` describe block:

```ts
describe('onboarding handlers', () => {
  it('reports whether onboarding is complete', () => {
    expect(call(IPC.getOnboardingCompleted, TRUSTED)).toBe(false)
  })

  it('marks onboarding complete', () => {
    call(IPC.completeOnboarding, TRUSTED)

    expect(fakes.completeOnboarding).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/ipc.test.ts`
Expected: FAIL — `IPC.getOnboardingCompleted`/`IPC.completeOnboarding` are `undefined` (not yet in the `IPC` const), and `fakes` has no such keys.

- [ ] **Step 3: Implement the shared contract**

In `src/shared/ipc.ts`, add two entries to the `IPC` const, right after `setProfileName`:

```ts
  getOnboardingCompleted: 'onboarding:get-completed',
  completeOnboarding: 'onboarding:complete',
```

Add two methods to `TrophyLockerApi`, right after `setProfileName`:

```ts
  getOnboardingCompleted(): Promise<boolean>
  completeOnboarding(): Promise<void>
```

- [ ] **Step 4: Implement the main-process handler**

In `src/main/ipc.ts`, add two methods to `IpcHandlers`, right after `setProfileName`:

```ts
  getOnboardingCompleted(): boolean
  completeOnboarding(): void
```

Add two registrations in `registerIpcHandlers`, right after the `IPC.setProfileName` handler:

```ts
  ipcMain.handle(IPC.getOnboardingCompleted, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getOnboardingCompleted()
  })

  ipcMain.handle(IPC.completeOnboarding, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    handlers.completeOnboarding()
  })
```

- [ ] **Step 5: Wire the preload bridge**

In `src/preload/index.ts`, add two entries to the `api` object, right after `setProfileName`:

```ts
  getOnboardingCompleted: () => ipcRenderer.invoke(IPC.getOnboardingCompleted),
  completeOnboarding: () => ipcRenderer.invoke(IPC.completeOnboarding),
```

- [ ] **Step 6: Wire the real handlers in `main/index.ts`**

Add `readOnboardingCompleted, saveOnboardingCompleted` to the existing import from `./store/settings-store`:

```ts
import {
  readNotificationSettings,
  readOnboardingCompleted,
  saveOnboardingCompleted,
  saveProfileName,
  updateNotificationSettings,
} from './store/settings-store'
```

In the `registerIpcHandlers({ ... })` call, add two entries right after the `setProfileName` handler:

```ts
    getOnboardingCompleted: () => readOnboardingCompleted(db),
    completeOnboarding: () => saveOnboardingCompleted(db),
```

- [ ] **Step 7: Add the fake to `fake-api.ts`**

In `src/renderer/src/test/fake-api.ts`, add two entries right after `setProfileName`:

```ts
    getOnboardingCompleted: vi.fn().mockResolvedValue(true),
    completeOnboarding: vi.fn().mockResolvedValue(undefined),
```

- [ ] **Step 8: Run the tests to verify everything passes**

Run: `npx vitest run src/main/ipc.test.ts`
Expected: PASS, all tests in the file.

Run: `npm run typecheck`
Expected: PASS (confirms `TrophyLockerApi`, `IpcHandlers` and the preload/fake implementations all agree).

- [ ] **Step 9: Commit**

```bash
git add src/shared/ipc.ts src/main/ipc.ts src/main/ipc.test.ts src/preload/index.ts src/main/index.ts src/renderer/src/test/fake-api.ts
git commit -m "Add the onboarding-completed IPC channel"
```

---

### Task 3: Shared `EmptyState` component

**Files:**
- Create: `src/renderer/src/components/EmptyState.tsx`
- Test: `src/renderer/src/components/EmptyState.test.tsx`

**Interfaces:**
- Consumes: `Button` from `./Button` (existing).
- Produces: `EmptyState` component, `import { EmptyState } from '@/components/EmptyState'`, props `{ icon: ReactNode; heading: string; body: string; cta: string; onAction: () => void }`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/EmptyState.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Plug } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

afterEach(() => {
  cleanup()
})

describe('EmptyState', () => {
  it('shows the icon, heading, body and calls the action when its button is clicked', () => {
    const onAction = vi.fn()
    render(
      <EmptyState
        icon={<Plug aria-hidden="true" />}
        heading="Nothing tracked yet"
        body="Connect a platform to start tracking your achievements."
        cta="Connect a platform"
        onAction={onAction}
      />,
    )

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Nothing tracked yet')
    expect(status).toHaveTextContent('Connect a platform to start tracking your achievements.')

    fireEvent.click(screen.getByRole('button', { name: 'Connect a platform' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/EmptyState.test.tsx`
Expected: FAIL — cannot find module `./EmptyState`.

- [ ] **Step 3: Implement**

Create `src/renderer/src/components/EmptyState.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon: ReactNode
  heading: string
  body: string
  cta: string
  onAction: () => void
}

export function EmptyState({ icon, heading, body, cta, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-panel border-[1.5px] border-dashed border-white/16 bg-white/2 p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        {icon}
      </span>
      <div role="status" className="flex flex-col gap-1">
        <p className="font-display text-xl font-bold">{heading}</p>
        <p className="text-fg-muted">{body}</p>
      </div>
      <Button onClick={onAction}>{cta}</Button>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/components/EmptyState.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/EmptyState.tsx src/renderer/src/components/EmptyState.test.tsx
git commit -m "Add the shared EmptyState component"
```

---

### Task 4: Dashboard empty state

**Files:**
- Modify: `src/renderer/src/features/dashboard/Dashboard.tsx`
- Test: `src/renderer/src/features/dashboard/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `EmptyState` from Task 3; `DashboardProps.onNavigate: (page: PageId) => void` (already exists).

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/src/features/dashboard/Dashboard.test.tsx`, inside the `describe('Dashboard', ...)` block (or as its own `describe` after it — place it right after the existing `it('says when nothing has been unlocked yet', ...)` test):

```tsx
  it('shows an empty state with no platforms and no unlocks, whose button opens Accounts', async () => {
    renderDashboard({ ...STATS, platforms: [], recentUnlocks: [] })

    expect(await screen.findByText('Nothing tracked yet')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Achievements unlocked' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Connect a platform' }))
    expect(onNavigate).toHaveBeenCalledWith('accounts')
  })
```

(`fireEvent` and `onNavigate` are already imported/declared at the top of this file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/dashboard/Dashboard.test.tsx`
Expected: FAIL — "Nothing tracked yet" not found (Dashboard currently renders the hero with zeros instead).

- [ ] **Step 3: Implement**

In `src/renderer/src/features/dashboard/Dashboard.tsx`, add imports:

```tsx
import { Plug } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
```

Replace the `Dashboard` function body's conditional render:

```tsx
export function Dashboard({ onOpenGame, onNavigate }: DashboardProps) {
  const stats = useDashboardStats()

  return (
    <div className="flex flex-col gap-14">
      <h1 className="sr-only">Dashboard</h1>
      {!stats ? (
        <p role="status">Loading...</p>
      ) : stats.platforms.length === 0 && stats.recentUnlocks.length === 0 ? (
        <EmptyState
          icon={<Plug aria-hidden="true" className="size-6" />}
          heading="Nothing tracked yet"
          body="Connect a platform to start tracking your achievements, unlocks and progress."
          cta="Connect a platform"
          onAction={() => onNavigate('accounts')}
        />
      ) : (
        <DashboardContent stats={stats} onOpenGame={onOpenGame} onNavigate={onNavigate} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/features/dashboard/Dashboard.test.tsx`
Expected: PASS, all tests in the file (confirms the three existing tests using partially-empty `STATS` overrides — `nearlyThere: []`, `recentUnlocks: []` alone, `platforms: []` alone — are unaffected, since none of them empties both fields at once).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/dashboard/Dashboard.tsx src/renderer/src/features/dashboard/Dashboard.test.tsx
git commit -m "Give the Dashboard an empty state when nothing is connected"
```

---

### Task 5: Library empty state

**Files:**
- Modify: `src/renderer/src/features/library/Library.tsx`
- Modify: `src/renderer/src/features/library/Library.test.tsx`
- Modify: `src/renderer/src/app/App.tsx`

**Interfaces:**
- Consumes: `EmptyState` from Task 3.
- Produces: `LibraryProps` gains a required `onOpenAccounts: () => void`.

- [ ] **Step 1: Write the failing test**

In `src/renderer/src/features/library/Library.test.tsx`, add `const onOpenAccounts = vi.fn()` next to the existing `const onOpenGame = vi.fn()` / `const onViewChange = vi.fn<...>()` declarations, add `onOpenAccounts={onOpenAccounts}` to the `<Library>` element inside `Harness`, and change the existing test:

```tsx
  it('points to the Accounts screen when there are no games', async () => {
    listLibrary.mockResolvedValue([])
    renderScrolled(<Harness />)

    expect(await screen.findByRole('status')).toHaveTextContent('Connect an account')
    fireEvent.click(screen.getByRole('button', { name: 'Go to Accounts' }))
    expect(onOpenAccounts).toHaveBeenCalledOnce()
  })
```

(`fireEvent` is already imported in this file, via `beforeEach`'s usage elsewhere in the suite — if not already in the top-level import list, add it to the existing `@testing-library/react` import line.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/library/Library.test.tsx`
Expected: FAIL two ways in sequence as you fix them — first a TypeScript error (`onOpenAccounts` not in `LibraryProps` yet, or missing on `<Library>` — run `npm run typecheck` to see it, since Vitest under Vite may still transpile it), then, once compiling, "Go to Accounts" not found.

- [ ] **Step 3: Implement**

In `src/renderer/src/features/library/Library.tsx`, add to the lucide-react import line:

```tsx
import { ArrowDownUp, LayoutGrid, List, ListFilter, Plug, RectangleVertical } from 'lucide-react'
```

Add a new import:

```tsx
import { EmptyState } from '@/components/EmptyState'
```

Add `onOpenAccounts: () => void` to `LibraryProps`:

```tsx
interface LibraryProps {
  name: string
  view: LibraryView
  onViewChange: (view: LibraryView) => void
  restoreScrollTop?: number
  onOpenGame: (id: number) => void
  onOpenAccounts: () => void
}
```

Destructure it in `LibraryBody` and replace the empty-state return:

```tsx
function LibraryBody({
  name,
  view,
  onViewChange,
  restoreScrollTop = 0,
  onOpenGame,
  onOpenAccounts,
}: LibraryProps) {
  const games = useLibrary()
  const stats = useDashboardStats()
  const scrollParent = useScrollParent()
  const loaded = games !== null

  useLayoutEffect(() => {
    if (loaded && scrollParent && restoreScrollTop > 0) setScrollTop(scrollParent, restoreScrollTop)
  }, [loaded, scrollParent, restoreScrollTop])

  if (!games) {
    return <p role="status">Loading...</p>
  }

  if (games.length === 0) {
    return (
      <EmptyState
        icon={<Plug aria-hidden="true" className="size-6" />}
        heading="No games yet"
        body="Connect an account on the Accounts screen and its games appear here."
        cta="Go to Accounts"
        onAction={onOpenAccounts}
      />
    )
  }
```

In `src/renderer/src/app/App.tsx`, in `PageContent`'s `case 'library':` branch, add the new prop:

```tsx
    case 'library':
      return (
        <Library
          name={displayName(profile)}
          view={libraryView}
          onViewChange={onLibraryViewChange}
          restoreScrollTop={libraryScrollTop}
          onOpenGame={onOpenGame}
          onOpenAccounts={() => onNavigate('accounts')}
        />
      )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/features/library/Library.test.tsx`
Expected: PASS, all tests in the file.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/library/Library.tsx src/renderer/src/features/library/Library.test.tsx src/renderer/src/app/App.tsx
git commit -m "Give the Library's empty state a way into Accounts"
```

---

### Task 6: Activity empty state

**Files:**
- Modify: `src/renderer/src/features/activity/Activity.tsx`
- Modify: `src/renderer/src/features/activity/Activity.test.tsx`
- Modify: `src/renderer/src/app/App.tsx`

**Interfaces:**
- Consumes: `EmptyState` from Task 3.
- Produces: `ActivityProps` gains a required `onOpenAccounts: () => void`.

- [ ] **Step 1: Write the failing test**

In `src/renderer/src/features/activity/Activity.test.tsx`:

1. Add `const onOpenAccounts = vi.fn()` next to the existing `onOpenGame` declaration.
2. Replace every `<Activity onOpenGame={onOpenGame} />` with `<Activity onOpenGame={onOpenGame} onOpenAccounts={onOpenAccounts} />` — use a single `replace_all` edit on that shorter substring (not the full `render(...)` line), since it also has to catch the one usage at line ~244 inside `<StrictMode>` that isn't wrapped in `render(...)` on the same line. There are 14 occurrences in total (13 direct `render(...)` calls plus the one inside `StrictMode`).
3. Extend the empty-state test:

```tsx
  it('says when nothing has been unlocked yet, with a way into Accounts', async () => {
    listActivity.mockResolvedValue({ unlocks: [], hasMore: false })
    render(<Activity onOpenGame={onOpenGame} onOpenAccounts={onOpenAccounts} />)

    expect(await screen.findByText(/Nothing unlocked yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Go to Accounts' }))
    expect(onOpenAccounts).toHaveBeenCalledOnce()
  })
```

(replacing the previous `it('says when nothing has been unlocked yet', ...)` test with this one.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run typecheck`
Expected: FAIL — `onOpenAccounts` is not a known prop of `Activity` yet.

- [ ] **Step 3: Implement**

In `src/renderer/src/features/activity/Activity.tsx`, add imports:

```tsx
import { Plug } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
```

Add `onOpenAccounts: () => void` to `ActivityProps` and use it:

```tsx
interface ActivityProps {
  onOpenGame: (id: number, platformGameId?: number) => void
  onOpenAccounts: () => void
}

export function Activity({ onOpenGame, onOpenAccounts }: ActivityProps) {
  const stats = useDashboardStats()

  return (
    <div className="mx-auto flex max-w-270 flex-col">
      <ActivityHeader stats={stats} />
      <ActivityDays onOpenGame={onOpenGame} onOpenAccounts={onOpenAccounts} />
    </div>
  )
}

function ActivityDays({ onOpenGame, onOpenAccounts }: ActivityProps) {
  const { page, canShowMore, showMore } = useActivity()

  if (!page) {
    return <p role="status">Loading...</p>
  }

  if (page.unlocks.length === 0) {
    return (
      <EmptyState
        icon={<Plug aria-hidden="true" className="size-6" />}
        heading="Nothing unlocked yet"
        body="Connect an account on the Accounts screen, and every unlock will appear here."
        cta="Go to Accounts"
        onAction={onOpenAccounts}
      />
    )
  }
```

In `src/renderer/src/app/App.tsx`, in `PageContent`'s `case 'activity':` branch:

```tsx
    case 'activity':
      return <Activity onOpenGame={onOpenGame} onOpenAccounts={() => onNavigate('accounts')} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/features/activity/Activity.test.tsx`
Expected: PASS, all tests in the file.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/activity/Activity.tsx src/renderer/src/features/activity/Activity.test.tsx src/renderer/src/app/App.tsx
git commit -m "Give the Activity empty state a way into Accounts"
```

---

### Task 7: The three onboarding steps

**Files:**
- Create: `src/renderer/src/features/onboarding/WelcomeStep.tsx`
- Create: `src/renderer/src/features/onboarding/PlatformsStep.tsx`
- Create: `src/renderer/src/features/onboarding/DoneStep.tsx`
- Create: `src/renderer/src/features/onboarding/Onboarding.tsx`
- Test: `src/renderer/src/features/onboarding/Onboarding.test.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/Button`), `ConnectPrompt` (`@/features/accounts/ConnectPrompt`), `ShadPs4Card` (`@/features/accounts/ShadPs4Card`), `ONLINE_PLATFORMS` (`@/features/accounts/sources`), `PlatformTile` (`@/components/PlatformTile`), `platformName` (`@shared/platform`), `plural` (`@/lib/format`), logo asset (`@/assets/logo.svg`) — all existing.
- Produces: `Onboarding` component, `import { Onboarding } from '@/features/onboarding/Onboarding'`, props `{ onDone: () => void }`. This is what Task 8 renders from `App.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/features/onboarding/Onboarding.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSummary, ConnectResult, SteamConnectInput } from '@shared/ipc'
import { Onboarding } from './Onboarding'
import { fakeApi } from '@/test/fake-api'

const connectSteam = vi.fn<(input: SteamConnectInput) => Promise<ConnectResult>>()
const onDone = vi.fn()

const STEAM_ACCOUNT: AccountSummary = {
  id: 1,
  platform: 'steam',
  displayName: 'Steam Player',
  status: 'connected',
  gameCount: 3,
  checkedGames: 0,
  unlockedCount: 0,
  lastSyncAt: null,
  syncing: false,
}

beforeEach(() => {
  window.api = fakeApi({ connectSteam })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function connectSteamInForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Connect Steam' }))
  fireEvent.change(screen.getByLabelText('SteamID64'), { target: { value: '76561190000000001' } })
  fireEvent.change(screen.getByLabelText('Steam API key'), { target: { value: 'KEY' } })
  fireEvent.click(
    within(screen.getByRole('form', { name: 'Connect with an API key' })).getByRole('button', {
      name: 'Connect',
    }),
  )
}

describe('Onboarding', () => {
  it('starts on Welcome, and Skip setup finishes onboarding from there', () => {
    render(<Onboarding onDone={onDone} />)

    expect(screen.getByRole('heading', { name: 'Welcome to Trophy Locker' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))

    expect(onDone).toHaveBeenCalledOnce()
  })

  it('moves from Welcome to Platforms, where Continue starts disabled', () => {
    render(<Onboarding onDone={onDone} />)

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    expect(screen.getByRole('heading', { name: 'Connect your platforms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Connect Steam' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'shadPS4, not connected' })).toBeInTheDocument()
  })

  it('goes back from Platforms to Welcome', () => {
    render(<Onboarding onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByRole('heading', { name: 'Welcome to Trophy Locker' })).toBeInTheDocument()
  })

  it('connecting a platform swaps its tile to Connected and enables Continue', async () => {
    connectSteam.mockResolvedValue({ ok: true, account: STEAM_ACCOUNT })
    render(<Onboarding onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    connectSteamInForm()

    expect(await screen.findByRole('region', { name: 'Steam, connected' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Steam' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('goes from Platforms to Done, reporting how many platforms connected, then finishes', async () => {
    connectSteam.mockResolvedValue({ ok: true, account: STEAM_ACCOUNT })
    render(<Onboarding onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    connectSteamInForm()
    await screen.findByRole('region', { name: 'Steam, connected' })

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: "You're set up" })).toBeInTheDocument()
    expect(screen.getByText(/1 platform connected/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Go to Dashboard' }))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('Skip setup finishes onboarding from the Platforms step too', () => {
    render(<Onboarding onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))

    expect(onDone).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/features/onboarding/Onboarding.test.tsx`
Expected: FAIL — cannot find module `./Onboarding`.

- [ ] **Step 3: Implement `WelcomeStep.tsx`**

```tsx
import { Button } from '@/components/Button'

interface WelcomeStepProps {
  onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <h1 className="font-display text-5xl font-extrabold">Welcome to Trophy Locker</h1>
      <p className="max-w-140 text-lg text-fg-muted">
        Track every achievement and trophy across Steam, Xbox, PlayStation, Epic, Ubisoft, EA and
        your emulators, in one place, with a toast the moment you unlock one.
      </p>
      <Button onClick={onNext}>Get started</Button>
    </div>
  )
}
```

- [ ] **Step 4: Implement `PlatformsStep.tsx`**

```tsx
import { CircleCheck } from 'lucide-react'
import { Button } from '@/components/Button'
import { PlatformTile } from '@/components/PlatformTile'
import { ConnectPrompt } from '@/features/accounts/ConnectPrompt'
import { ShadPs4Card } from '@/features/accounts/ShadPs4Card'
import { ONLINE_PLATFORMS } from '@/features/accounts/sources'
import { plural } from '@/lib/format'
import type { Platform } from '@shared/platform'
import { platformName } from '@shared/platform'

interface PlatformsStepProps {
  connectedPlatforms: ReadonlySet<string>
  onPlatformConnected: (platform: string) => void
  onBack: () => void
  onContinue: () => void
}

export function PlatformsStep({
  connectedPlatforms,
  onPlatformConnected,
  onBack,
  onContinue,
}: PlatformsStepProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold">Connect your platforms</h2>
        <p className="mt-2 text-fg-muted">
          Pick where you play. Everything stays on this machine.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ONLINE_PLATFORMS.map((platform) =>
          connectedPlatforms.has(platform) ? (
            <ConnectedTile key={platform} platform={platform} />
          ) : (
            <ConnectPrompt
              key={platform}
              platform={platform}
              onConnected={() => onPlatformConnected(platform)}
            />
          ),
        )}
        {connectedPlatforms.has('shadps4') ? (
          <ConnectedTile platform="shadps4" />
        ) : (
          <ShadPs4Card connectedNames={[]} onConnected={() => onPlatformConnected('shadps4')} />
        )}
      </div>

      <div className="flex items-center justify-between rounded-island border border-white/9 bg-surface-1/72 px-6 py-4">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <p className="text-sm text-fg-muted">
          {connectedPlatforms.size === 0
            ? 'No platforms connected yet'
            : `${plural(connectedPlatforms.size, 'platform')} connected`}
        </p>
        <Button disabled={connectedPlatforms.size === 0} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}

function ConnectedTile({ platform }: { platform: Platform }) {
  return (
    <section
      aria-label={`${platformName(platform)}, connected`}
      className="flex flex-col items-center justify-center gap-3 rounded-panel border border-success/40 bg-success/6 p-6 text-center"
    >
      <PlatformTile platform={platform} />
      <p className="font-display text-lg font-bold">{platformName(platform)}</p>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-success">
        <CircleCheck aria-hidden="true" className="size-4" />
        Connected
      </span>
    </section>
  )
}
```

- [ ] **Step 5: Implement `DoneStep.tsx`**

```tsx
import { CircleCheck } from 'lucide-react'
import { Button } from '@/components/Button'
import { plural } from '@/lib/format'

interface DoneStepProps {
  connectedCount: number
  onDone: () => void
}

export function DoneStep({ connectedCount, onDone }: DoneStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
        <CircleCheck aria-hidden="true" className="size-8" />
      </span>
      <h1 className="font-display text-4xl font-extrabold">You're set up</h1>
      <p className="max-w-120 text-fg-muted">
        {plural(connectedCount, 'platform')} connected and syncing in the background. Your games
        will appear as they sync.
      </p>
      <Button onClick={onDone}>Go to Dashboard</Button>
    </div>
  )
}
```

- [ ] **Step 6: Implement `Onboarding.tsx`**

```tsx
import { useState } from 'react'
import logo from '@/assets/logo.svg'
import { DoneStep } from './DoneStep'
import { PlatformsStep } from './PlatformsStep'
import { WelcomeStep } from './WelcomeStep'

type Step = 'welcome' | 'platforms' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'done', label: 'Done' },
]

interface OnboardingProps {
  onDone: () => void
}

export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<string>>(new Set())
  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="flex min-h-screen flex-col bg-aurora">
      <header className="mx-auto flex h-21 w-[calc(100%-48px)] max-w-348 items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="size-9" />
          <span className="font-display text-lg font-bold">Trophy Locker</span>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-white/6 px-4 py-2 text-sm font-semibold text-fg-muted hover:bg-white/10 hover:text-fg"
        >
          Skip setup
        </button>
      </header>

      <ol className="mx-auto mt-4 flex items-center gap-3" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3">
            <span
              aria-current={s.id === step ? 'step' : undefined}
              className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${
                i <= stepIndex ? 'bg-primary text-on-primary' : 'bg-white/8 text-fg-subtle'
              }`}
            >
              {i < stepIndex ? '✓' : i + 1}
            </span>
            <span className={i <= stepIndex ? 'text-fg' : 'text-fg-subtle'}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="h-0.5 w-10 rounded-full bg-white/10" />}
          </li>
        ))}
      </ol>

      <main className="mx-auto mt-10 w-[calc(100%-48px)] max-w-348 flex-1 pb-20">
        {step === 'welcome' && <WelcomeStep onNext={() => setStep('platforms')} />}
        {step === 'platforms' && (
          <PlatformsStep
            connectedPlatforms={connectedPlatforms}
            onPlatformConnected={(platform) =>
              setConnectedPlatforms((current) => new Set(current).add(platform))
            }
            onBack={() => setStep('welcome')}
            onContinue={() => setStep('done')}
          />
        )}
        {step === 'done' && <DoneStep connectedCount={connectedPlatforms.size} onDone={onDone} />}
      </main>
    </div>
  )
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/features/onboarding/Onboarding.test.tsx`
Expected: PASS, all tests in the file.

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS, zero warnings (check unused-import and `size` Tailwind class rules pass).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/features/onboarding/
git commit -m "Build the onboarding wizard: Welcome, Platforms and Done"
```

---

### Task 8: Wire `App.tsx` to show onboarding, and gate it correctly

**Files:**
- Create: `src/renderer/src/app/useOnboarding.ts`
- Modify: `src/renderer/src/app/App.tsx`
- Modify: `src/renderer/src/app/App.test.tsx`

**Interfaces:**
- Consumes: `Onboarding` from Task 7; `window.api.getOnboardingCompleted`/`completeOnboarding` from Task 2; `useAccounts` from `@/features/accounts/useAccounts` (existing).
- Produces: `useOnboarding(): { completed: boolean | null; complete: () => Promise<void> }`.

- [ ] **Step 1: Write the failing tests**

Add to `src/renderer/src/app/App.test.tsx`, as a new `describe` block after the existing `describe('App', ...)` block:

```tsx
describe('App: onboarding', () => {
  it('shows onboarding when it has not been completed and no account is connected', async () => {
    window.api = fakeApi({
      getOnboardingCompleted: vi.fn().mockResolvedValue(false),
      listAccounts: vi.fn().mockResolvedValue([]),
    })
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Welcome to Trophy Locker' }),
    ).toBeInTheDocument()
  })

  it('skips onboarding once an account exists, even if it was never completed', async () => {
    window.api = fakeApi({
      getOnboardingCompleted: vi.fn().mockResolvedValue(false),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: 1,
          platform: 'steam',
          displayName: 'Steam Player',
          status: 'connected',
          gameCount: 3,
          checkedGames: 0,
          unlockedCount: 0,
          lastSyncAt: null,
          syncing: false,
        },
      ]),
    })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Welcome to Trophy Locker' }),
    ).not.toBeInTheDocument()
  })

  it('finishing onboarding marks it complete and shows the normal app', async () => {
    const completeOnboarding = vi.fn().mockResolvedValue(undefined)
    window.api = fakeApi({
      getOnboardingCompleted: vi.fn().mockResolvedValue(false),
      completeOnboarding,
      listAccounts: vi.fn().mockResolvedValue([]),
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Skip setup' }))

    expect(completeOnboarding).toHaveBeenCalledOnce()
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/app/App.test.tsx`
Expected: FAIL — the first two new tests time out waiting for "Welcome to Trophy Locker" / never seeing it (App always renders the normal shell today).

- [ ] **Step 3: Implement `useOnboarding.ts`**

```ts
import { useEffect, useState } from 'react'

export function useOnboarding() {
  const [completed, setCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.getOnboardingCompleted().then((value) => {
      if (!cancelled) setCompleted(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const complete = async () => {
    await window.api.completeOnboarding()
    setCompleted(true)
  }

  return { completed, complete }
}
```

- [ ] **Step 4: Wire it into `App.tsx`**

Add imports:

```tsx
import { useAccounts } from '@/features/accounts/useAccounts'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { useOnboarding } from './useOnboarding'
```

In `export function App()`, add the two hooks after `const { profile, rename } = useProfile()`, and an early return after `current` is computed and before the `return (` that renders the normal shell:

```tsx
export function App() {
  const [page, setPage] = useState<PageId>('dashboard')
  const [opened, setOpened] = useState<{ id: number; entry?: number } | null>(null)
  const { profile, rename } = useProfile()
  const { accounts } = useAccounts()
  const { completed, complete } = useOnboarding()
  const [libraryView, setLibraryView] = useState<LibraryView>(DEFAULT_VIEW)
  const [libraryScrollTop, setLibraryScrollTop] = useState(0)
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (scrollParent) setScrollTop(scrollParent, 0)
  }, [page, opened, scrollParent])

  const selectPage = (next: PageId) => {
    setLibraryScrollTop(0)
    setPage(next)
    setOpened(null)
  }
  const searchLibrary = (query: string) => {
    setLibraryView((view) => ({ ...view, query }))
    if (page !== 'library' || opened !== null) selectPage('library')
  }
  const openGame = (id: number, entry?: number) => {
    const fromLibrary = page === 'library' && opened === null
    setLibraryScrollTop(fromLibrary && scrollParent ? scrollParent.scrollTop : 0)
    setPage('library')
    setOpened({ id, entry })
  }

  const current = NAV_ITEMS.find((item) => item.id === page) ?? NAV_ITEMS[0]!

  if (completed === false && accounts !== null && accounts.length === 0) {
    return <Onboarding onDone={complete} />
  }

  return (
```

(everything from `return (` down is unchanged.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/app/App.test.tsx`
Expected: PASS, all tests in the file, including the original `describe('App', ...)` and `describe('App: opening a game', ...)` blocks (their default `fakeApi()` resolves `getOnboardingCompleted` to `true`, so `completed === false` is never true and onboarding never renders for them).

Run: `npm test`
Expected: PASS, every test in the repo (confirms no other suite renders `<App />` or depends on `useAccounts`/`useOnboarding` timing).

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/useOnboarding.ts src/renderer/src/app/App.tsx src/renderer/src/app/App.test.tsx
git commit -m "Show onboarding on a first launch with no accounts"
```

---

### Task 9: Docs

**Files:**
- Modify: `docs/SPEC.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PROJECT-MAP.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `docs/SPEC.md`**

In section 1's requirements table, add a row after `F-35`:

```
| F-36 | Onboarding wizard (Welcome → Platforms → Done) on a first launch with no accounts, shown once and skippable; empty states on Dashboard, Library and Activity pointing at Accounts when there is nothing to show | P1 |
```

In section 6's IPC contract table, add two rows after the `setProfileName` row:

```
| `getOnboardingCompleted()` | `onboarding:get-completed` | Whether the onboarding wizard has been finished or skipped (`onboarding.completed` in the `setting` table, default `false`) |
| `completeOnboarding()` | `onboarding:complete` | Marks onboarding finished; `App.tsx` stops showing it from then on, even if every account is later disconnected |
```

In section 7's settings block, add a line after the closing `}` of the JSON, or as a short sentence beneath it:

```
`onboarding.completed` (boolean, default `false`) is stored the same way as `profile.name`, directly under its own `setting` key rather than inside this nested block.
```

- [ ] **Step 2: `docs/ARCHITECTURE.md`**

In section 3 ("Key data flows"), add a short new bullet describing the gate, matching the style of the existing Xbox-sign-in-flow paragraph:

```
**Onboarding:** `App.tsx` reads `onboarding.completed` (`useOnboarding`) and the connected-accounts list (`useAccounts`) once at startup; while onboarding is not complete and no account is connected, it renders `Onboarding` instead of the nav and page shell. Its Platforms step reuses `ConnectPrompt`/`ShadPs4Card` from the Accounts screen unmodified, so every sign-in flow stays in one place.
```

In section 6's folder structure, change line 141's parenthetical from `(dashboard, library, game-detail and accounts started)` to `(dashboard, library, game-detail, accounts and onboarding started)`.

- [ ] **Step 3: `docs/PROJECT-MAP.md`**

Read the file's renderer/`features/` section (the part listing `dashboard/`, `library/`, `game-detail/`, `activity/`, `accounts/`, `settings/` with their Real/Placeholder/Stub status, following the same convention explained at the top of the file). Add an entry for `features/onboarding/` (status Real) describing `Onboarding.tsx`, `WelcomeStep.tsx`, `PlatformsStep.tsx`, `DoneStep.tsx`, and a line for `components/EmptyState.tsx` in the shared-components listing. Add `useOnboarding.ts` to the `app/` entry alongside `useProfile.ts`. Update `src/main/store/settings-store.ts`'s description to mention `onboarding.completed` alongside `profile.name` and `notifications.settings`.

- [ ] **Step 4: `docs/ROADMAP.md`**

Change the M5 line:

```
- [ ] Onboarding flow, empty/error states, provider health UI
```

to:

```
- [x] Onboarding flow, empty/error states, provider health UI: a 3-step wizard (Welcome, Platforms, Done) shows on a first launch with no accounts, reusing the Accounts screen's own connect flows (including shadPS4) for the Platforms step; skippable, shown once. Dashboard, Library and Activity each show an empty state pointing at Accounts when they have nothing to show. Provider health UI needed no new work: it was already built across M4/M5 (AccountCard's status badges and sync progress, the nav's "Check accounts")
```

Change the M5b line:

```
- [ ] Emulators step in onboarding
```

to:

```
- [x] Emulators step in onboarding: shadPS4 is one of the Platforms step's tiles, alongside the six online platforms
```

- [ ] **Step 5: `CLAUDE.md`**

At the end of the Status paragraph, append a sentence:

```
Onboarding welcomes a first launch with no accounts (Welcome → Platforms → Done, reusing the Accounts screen's own connect flows including shadPS4), shown once and skippable; Dashboard, Library and Activity each show an empty state pointing at Accounts when there is nothing to show yet.
```

Update the test count in the Status paragraph's opening sentence ("lint, typecheck, N tests...") to the actual count from this plan's final `npm test` run (Task 8, Step 5).

- [ ] **Step 6: Commit**

```bash
git add docs/SPEC.md docs/ARCHITECTURE.md docs/PROJECT-MAP.md docs/ROADMAP.md CLAUDE.md
git commit -m "Update docs for onboarding, empty states and provider health"
```

---

### Task 10: Final verification and PR

**Files:** none

- [ ] **Step 1: Full verification**

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

All must pass with zero warnings/errors.

- [ ] **Step 2: Run the app and check the flows live**

```bash
npm run dev
```

Delete or rename the app's local database (or use a scratch profile) so `listAccounts` starts empty, confirm: onboarding appears on launch; Welcome → Get started → Platforms; connecting Steam (or any platform) swaps its tile to "Connected" and enables Continue; Continue → Done shows the right count; Go to Dashboard enters the normal app; relaunching does not show onboarding again. Then with at least one account connected, empty out the Library/Activity data (or check on a fresh profile) to see the new `EmptyState` on Dashboard/Library/Activity, and confirm their buttons open Accounts.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feature/onboarding
gh pr create --title "Onboarding wizard, empty states and provider-health verdict" --body "$(cat <<'EOF'
## Summary
- Adds a 3-step onboarding wizard (Welcome, Platforms, Done) shown once on a first launch with no accounts, reusing the Accounts screen's existing ConnectPrompt/ShadPs4Card flows unmodified for every sign-in.
- Adds a shared EmptyState component; Dashboard gets one it never had, and Library/Activity's existing plain-text empty states are upgraded to match, each pointing at Accounts.
- Provider health UI needed no new work — verdict recorded in the design doc and ROADMAP.md: already built across M4/M5 (AccountCard's status badges and sync progress, the nav's "Check accounts").
- Closes the M5 roadmap item and M5b's "Emulators step in onboarding".

## Test plan
- [x] npm run format:check
- [x] npm run lint
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] Ran the built app live: onboarding on a fresh profile, connecting a platform, Skip setup, and the new empty states on Dashboard/Library/Activity
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Trigger/persistence (Task 1, 2, 8), 3-step wizard reusing ConnectPrompt/ShadPs4Card (Task 7), empty states on all three screens (Tasks 4-6), provider-health verdict (Task 9 docs, no code task needed — matches the spec's own verdict), docs list (Task 9) — all covered.
- **Placeholder scan:** no TBD/TODO; every step has literal code or literal doc text.
- **Type consistency:** `EmptyState`'s props (`icon`, `heading`, `body`, `cta`, `onAction`) are identical across Tasks 3, 4, 5, 6. `PlatformsStepProps`/`DoneStepProps` field names match between Task 7's `Onboarding.tsx` call sites and the step components' own definitions. `useOnboarding()`'s `{ completed, complete }` shape matches Task 8's `App.tsx` usage.
