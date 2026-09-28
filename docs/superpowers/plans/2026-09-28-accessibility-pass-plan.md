# Accessibility Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Trophy Locker's M5 roadmap item "Accessibility pass, reduced motion, high contrast": respect the OS's reduced-motion and contrast preferences automatically, fix one color token that fails WCAG AA for its actual usage, and fix two ARIA gaps found during the onboarding wizard's review.

**Architecture:** Two independent, small changes — a CSS/config layer (a global reduced-motion media query, `MotionConfig` on both React roots, one token value fix) that needs no new component code, and two targeted ARIA corrections in `EmptyState.tsx` and `Onboarding.tsx`. No new app settings, no new components, no schema changes.

**Tech Stack:** Electron + TypeScript + React, Tailwind v4 (`@theme` tokens in `styles/index.css`), the `motion` package (`motion/react`, already in use for the toast overlay), Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-28-accessibility-pass-design.md](../specs/2026-09-28-accessibility-pass-design.md)

## Global Constraints

- No code comments anywhere (CLAUDE.md style rule).
- Never hard-code hex colors in components — colors live only in `styles/index.css`'s `@theme` block (CLAUDE.md style rule); this plan's one color change is exactly there.
- TypeScript strict, no `any`; Prettier formatting (no semicolons, single quotes); ESLint zero warnings.
- Pure CSS/token changes need no test — verified by running the app, per CLAUDE.md ("Pure styling (a token, a class name) needs no test; say so"). This plan says so explicitly in Task 1 and does not invent tests for it.
- Tests are written by Claude, following this repo's existing conventions exactly (`// @vitest-environment jsdom` pragma, `@testing-library/react`, role/text-based queries).
- One feature branch + one PR for this whole plan (repo convention), branched from `main`.

---

### Task 1: Reduced motion and contrast — CSS and config only

**Files:**
- Modify: `src/renderer/src/styles/index.css`
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/overlay/main.tsx`

**Interfaces:** None — this task has no exports or props other tasks depend on. It's a leaf change.

**Context for the implementer:** `overlay/Toast.tsx` already calls `useReducedMotion()` from `motion/react` itself and conditionally builds its own `initial`/`animate`/`exit` props and its shine-sweep effect around it — it does not need any change here, and no behavior change is expected there. `<MotionConfig reducedMotion="user">` is the `motion` package's own systemic mechanism for any future `motion.*` component that doesn't do that manual check itself; it's a two-line, zero-risk addition, not a fix for a bug that exists today.

- [ ] **Step 1: Add the reduced-motion media query**

In `src/renderer/src/styles/index.css`, add this block after the existing `@layer components { .bg-aurora {...} }` block (so it sits alongside the other structural CSS, before `@layer base`):

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Fix the `fg-subtle` contrast token**

In the same file's `@theme` block, change:

```css
  --color-fg-subtle: #626b82;
```

to:

```css
  --color-fg-subtle: #888fa0;
```

(Computed: the old value was 3.1–3.7:1 against the app's dark backgrounds — below the 4.5:1 WCAG AA threshold for normal-size text, and it's used that way in `AccountCard.tsx`'s stat labels, `Toast.tsx`'s platform/time line and `AchievementRow.tsx`'s description text. The new value clears 4.5:1 even against the lightest background it's paired with, `--color-surface-3` — 4.53:1 there, 6.11:1 against `--color-canvas`.)

- [ ] **Step 3: Wrap both React roots in `MotionConfig`**

In `src/renderer/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import '@/styles/index.css'
import { App } from '@/app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
```

In `src/renderer/src/overlay/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import '@/styles/index.css'
import { OverlayApp } from './OverlayApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <OverlayApp />
    </MotionConfig>
  </StrictMode>,
)
```

- [ ] **Step 4: Verify live in the running app (no automated test — pure CSS/config)**

Run `npm run dev`. In Chrome DevTools (available via the app's dev tools, `Ctrl+Shift+I` in development), open the Rendering tab (Cmd/Ctrl+Shift+P → "Show Rendering") and set "Emulate CSS media feature prefers-reduced-motion" to "reduce". Confirm:
- Hover effects that used to animate (e.g. the Dashboard's "Nearly there" cover fan tiles lifting on hover, `CoverFan.tsx`) now happen instantly, no transition.
- Trigger a test toast (Settings → "Send test toast", or the tray's "Send test notification") and confirm it still appears and disappears correctly — Toast.tsx already handles this itself, so this step confirms nothing broke, not that something new works.

Then set the emulation back to "No emulation" and confirm hover/toast animations are back to normal.

Run `npm run typecheck` and `npm run lint` to confirm the two `.tsx` edits are clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/styles/index.css src/renderer/src/main.tsx src/renderer/src/overlay/main.tsx
git commit -m "$(cat <<'EOF'
Respect reduced-motion and fix a contrast-failing color token

A global prefers-reduced-motion media query neutralizes every
Tailwind-driven hover/transition effect app-wide, and MotionConfig on
both React roots is the systemic backstop for any motion.* component
(Toast.tsx already handles this itself via its own useReducedMotion()
check, so no behavior change is expected there).

--color-fg-subtle (#626b82) computed to 3.1-3.7:1 against the app's
dark backgrounds -- below WCAG AA's 4.5:1 for normal text, and it's
used that way in AccountCard's stat labels, Toast's platform/time
line, and AchievementRow's description text. New value #888fa0
clears 4.5:1 even against the lightest paired background
(--color-surface-3, 4.53:1; 6.11:1 against --color-canvas). Every
other color-token pairing in styles/index.css was computed and
already passes WCAG AA with wide margins.

Pure CSS/config change; no test (CLAUDE.md: pure styling needs none).
Verified live: hover animations and the toast both still work
correctly with prefers-reduced-motion emulated on and off.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `EmptyState` ARIA fix

**Files:**
- Modify: `src/renderer/src/components/EmptyState.tsx`
- Modify: `src/renderer/src/components/EmptyState.test.tsx`
- Modify: `src/renderer/src/features/library/Library.test.tsx:140-147`

**Interfaces:**
- Consumes: none new.
- Produces: `EmptyState`'s props (`icon`, `heading`, `body`, `cta`, `onAction`) are unchanged — only its internal markup changes, so `Dashboard.tsx`, `Library.tsx` and `Activity.tsx` (which already use it) need no changes.

**Context for the implementer:** Checked which tests currently assert against `EmptyState`'s `role="status"`. Only one does — `Library.test.tsx`'s `'points to the Accounts screen when there are no games'` test. `Dashboard.test.tsx` and `Activity.test.tsx` both already assert via `findByText(...)`/`findByText('Nothing tracked yet')` (text content, not role), so removing `role="status"` doesn't affect them — do not change those two files.

- [ ] **Step 1: Write the failing test**

Replace `EmptyState.test.tsx`'s only test with:

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

    expect(screen.getByRole('heading', { name: 'Nothing tracked yet' })).toBeInTheDocument()
    expect(
      screen.getByText('Connect a platform to start tracking your achievements.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Connect a platform' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('has no status live region, since this is static content, not a live announcement', () => {
    render(
      <EmptyState
        icon={<Plug aria-hidden="true" />}
        heading="Nothing tracked yet"
        body="Connect a platform."
        cta="Connect"
        onAction={() => {}}
      />,
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
```

Also update `Library.test.tsx`'s affected test (around line 140):

```tsx
  it('points to the Accounts screen when there are no games', async () => {
    listLibrary.mockResolvedValue([])
    renderScrolled(<Harness />)

    await screen.findByRole('heading', { name: 'No games yet' })
    expect(
      screen.getByText('Connect an account on the Accounts screen and its games appear here.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Accounts' }))
    expect(onOpenAccounts).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/EmptyState.test.tsx src/renderer/src/features/library/Library.test.tsx`
Expected: FAIL — `getByRole('heading', { name: 'Nothing tracked yet' })` finds nothing (the heading is currently a `<p>`, not a heading element), and the second `EmptyState` test fails because `role="status"` is still present.

- [ ] **Step 3: Implement**

In `src/renderer/src/components/EmptyState.tsx`, replace the return statement:

```tsx
export function EmptyState({ icon, heading, body, cta, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-panel border-[1.5px] border-dashed border-white/16 bg-white/2 p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-bold">{heading}</h2>
        <p className="text-fg-muted">{body}</p>
      </div>
      <Button onClick={onAction}>{cta}</Button>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/EmptyState.test.tsx src/renderer/src/features/library/Library.test.tsx`
Expected: PASS, all tests in both files (Library.test.tsx has many other tests beyond the one changed — confirm they're all still green, not just the one you touched).

Run: `npx vitest run src/renderer/src/features/dashboard/Dashboard.test.tsx src/renderer/src/features/activity/Activity.test.tsx`
Expected: PASS, unaffected (they query by text, not role, as established above) — this confirms that assumption held.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/EmptyState.tsx src/renderer/src/components/EmptyState.test.tsx src/renderer/src/features/library/Library.test.tsx
git commit -m "$(cat <<'EOF'
Give EmptyState a real heading instead of a role=status live region

Static content doesn't need a live region, and a <p> isn't a heading.
Now a real <h2>, matching how other cards in the app (AccountCard)
already do headings. Dashboard.tsx's and Activity.tsx's tests were
already querying by text, not role, so only Library.test.tsx's one
affected test needed updating.

Tests: EmptyState.test.tsx updated to query by heading role and text,
plus a new test confirming no status role remains; Library.test.tsx's
empty-state test updated the same way.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `Onboarding` step-indicator ARIA fix

**Files:**
- Modify: `src/renderer/src/features/onboarding/Onboarding.tsx:42-57`
- Modify: `src/renderer/src/features/onboarding/Onboarding.test.tsx`

**Interfaces:** None new — `Onboarding`'s own props are unchanged.

**Context for the implementer:** The current code puts `aria-current={s.id === step ? 'step' : undefined}` on the decorative circle (`✓`/number). Simply adding `aria-hidden="true"` to that circle would also silence its `aria-current` marking, losing a genuinely useful "you are here" signal for screen reader users navigating the `<ol>`. The fix moves `aria-current` onto the label `<span>` (the element that stays in the accessibility tree) before hiding the circle and the connector bar.

- [ ] **Step 1: Write the failing test**

Add to `Onboarding.test.tsx`, as a new test in the existing `describe('Onboarding', ...)` block. First check how the existing tests in this file supply `onFirstConnect` (a required `OnboardingProps` field) — every other test already passes it, likely via a shared `const onFirstConnect = vi.fn()` declared near the top of the file — and match that pattern instead of an inline `vi.fn()`:

```tsx
  it("hides the step indicator's decorative glyph and connector from the accessibility tree", () => {
    render(<Onboarding onDone={onDone} onFirstConnect={onFirstConnect} />)

    const progress = screen.getByRole('list', { name: 'Setup progress' })
    const hiddenWithinProgress = progress.querySelectorAll('[aria-hidden="true"]')
    expect(hiddenWithinProgress).toHaveLength(5)
    expect(screen.getByText('Welcome')).toHaveAttribute('aria-current', 'step')
  })
```

(`progress` is the `<ol>` returned by `getByRole('list', ...)`, a real DOM node — `.querySelectorAll` works on it directly. 5 hidden elements = 3 step circles + 2 connector bars between the 3 steps. `within` is already imported in this file from `@testing-library/react`, per the existing tests' `within(screen.getByRole(...))` usage; not needed for this test.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/features/onboarding/Onboarding.test.tsx`
Expected: FAIL — `aria-current` is currently on the circle `<span>` (which will become `aria-hidden`), not on the label `<span>` containing "Welcome", so `screen.getByText('Welcome')` does not currently have `aria-current="step"`.

- [ ] **Step 3: Implement**

In `src/renderer/src/features/onboarding/Onboarding.tsx`, replace the `<ol>` block:

```tsx
      <ol className="mx-auto mt-4 flex items-center gap-3" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${
                i <= stepIndex ? 'bg-primary text-on-primary' : 'bg-white/8 text-fg-subtle'
              }`}
            >
              {i < stepIndex ? '✓' : i + 1}
            </span>
            <span
              aria-current={s.id === step ? 'step' : undefined}
              className={i <= stepIndex ? 'text-fg' : 'text-fg-subtle'}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="h-0.5 w-10 rounded-full bg-white/10" />}
          </li>
        ))}
      </ol>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/features/onboarding/Onboarding.test.tsx`
Expected: PASS, all tests in the file (this file has several tests already covering Welcome/Platforms/Done transitions — confirm none of them broke, since none queried the circle's text content directly, only button/heading roles).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/onboarding/Onboarding.tsx src/renderer/src/features/onboarding/Onboarding.test.tsx
git commit -m "$(cat <<'EOF'
Hide the onboarding step indicator's decorative glyph and connector

The circle's checkmark/number and the bar between steps repeat what
the adjacent step label already says. aria-current moves from the
circle onto the label span (the element that stays in the
accessibility tree) before hiding the circle and connector, so
screen readers announce "Welcome, current step" etc. instead of an
unlabeled checkmark and bar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/PROJECT-MAP.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `docs/PROJECT-MAP.md`**

Find the `styles/index.css` row (around line 414 as of this plan's writing — re-find it, since line numbers drift). It currently reads, in part: "...plus a `.bg-aurora` background class (defined, not applied yet) and base styles." Replace that clause — `.bg-aurora` is now used by `App.tsx` and `Onboarding.tsx` — and add a short mention of the accessibility additions, in the row's existing narrative-prose style:

```
...plus a `.bg-aurora` background class (used by `App.tsx` and `Onboarding.tsx`) and base styles. A `prefers-reduced-motion` media query neutralizes CSS transitions app-wide; `--color-fg-subtle` was brightened to clear WCAG AA contrast.
```

(Keep the rest of that row's sentence about the rarity scope and platinum tokens unchanged — only replace the `.bg-aurora` clause and append the new sentence.)

- [ ] **Step 2: `docs/ROADMAP.md`**

Find the M5 line (search for "Accessibility pass"). Change:

```
- [ ] Accessibility pass, reduced motion, high contrast
```

to:

```
- [x] Accessibility pass, reduced motion, high contrast: a targeted pass, not a full audit. `prefers-reduced-motion` is respected app-wide (a global CSS media query plus `MotionConfig` on both React roots); every color-token pairing in `styles/index.css` was computed against WCAG AA, and the one that failed (`--color-fg-subtle`, used as small text in a few places) was brightened to clear it; Windows' forced-colors mode needed no code changes (checked). `EmptyState` uses a real heading instead of a `role="status"` live region, and the onboarding wizard's step indicator hides its decorative glyph and connector from screen readers
```

- [ ] **Step 3: `CLAUDE.md`**

At the end of the Status paragraph, append a sentence:

```
A targeted accessibility pass respects the OS's reduced-motion and contrast preferences automatically (no new app setting), fixed the one color token that failed WCAG AA for its actual usage, and cleaned up two ARIA gaps in the onboarding wizard and EmptyState.
```

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT-MAP.md docs/ROADMAP.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Update docs for the accessibility pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Final verification and PR

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

Beyond Task 1's reduced-motion check: open the Library or Activity screen with no accounts connected (or a fresh profile) and confirm the `EmptyState` still looks and reads correctly (heading, body, button all present and styled the same as before — only the underlying markup changed). Open the Onboarding wizard (fresh profile) and confirm the step indicator still looks the same visually.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feature/accessibility-pass
gh pr create --title "Accessibility pass: reduced motion, contrast, ARIA fixes" --body "$(cat <<'EOF'
## Summary
- Respects prefers-reduced-motion app-wide via a global CSS media query plus MotionConfig on both React roots (Toast.tsx already self-handles this; MotionConfig is the systemic backstop for any future motion component).
- Computed real WCAG AA contrast ratios for every color-token pairing in styles/index.css. One failed (--color-fg-subtle, used as small text in AccountCard/Toast/AchievementRow) and was brightened to clear it; every other pairing already passed with wide margins. Windows forced-colors mode needed no code changes (verified).
- EmptyState now uses a real <h2> instead of wrapping a <p> in a role="status" live region.
- The onboarding wizard's step indicator hides its decorative checkmark/number and connector bar from screen readers, moving aria-current onto the step label instead of losing it.
- Closes the M5 roadmap item "Accessibility pass, reduced motion, high contrast" (a targeted pass, not a full audit — scoped in the design doc).

## Test plan
- [x] npm run format:check
- [x] npm run lint
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] Verified live: hover/toast animations respect prefers-reduced-motion (Chrome DevTools emulation, on and off); EmptyState and the onboarding step indicator still look correct
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** reduced motion (Task 1), high contrast (Task 1), EmptyState ARIA (Task 2), Onboarding step-indicator ARIA (Task 3), docs (Task 4) — all covered. The spec's "verify forced-colors mode" item was already resolved as a no-op during brainstorming (confirmed no `outline-none` usage lacks a substitute) — no separate task needed, noted in the PR description instead.
- **Placeholder scan:** no TBD/TODO; every step has literal code or literal doc text.
- **Type consistency:** `EmptyState`'s props are unchanged across Task 2 and its three (untouched) consumers. `Onboarding`'s `OnboardingProps` (`onDone`, `onFirstConnect`) match between Task 3's test and the component's existing definition.
- **Correction found during planning:** the spec's Tests section said "the three consumers' tests... need the same query update — check each"; checking found only `Library.test.tsx` actually queried by `role="status"` (`Dashboard.test.tsx`/`Activity.test.tsx` already query by text). Task 2 reflects the narrower, correct scope rather than the spec's broader assumption.
