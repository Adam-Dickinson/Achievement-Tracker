# Accessibility pass: reduced motion, high contrast, ARIA fixes: design

- **Date:** 2026-09-28
- **Roadmap:** M5, "Accessibility pass, reduced motion, high contrast"
- **Status:** approved in conversation

## Goal

A targeted pass, not a full WCAG audit (that's a separate, larger effort if ever needed): respect the two OS-level preferences the roadmap names, fix the two concrete ARIA gaps found during the onboarding wizard's code review (left there on purpose, deferred to this pass), and fix the one color token that fails WCAG AA contrast for its actual usage. Nothing here adds a new app-level setting — both reduced motion and high contrast are read from the OS/browser preference automatically, the same way the app already inherits the OS's dark/light preference implicitly (it doesn't; it's dark-only, and that's unchanged here).

## 1. Reduced motion

Checked: the app has no `prefers-reduced-motion` handling anywhere today. Animation comes from two sources — the `motion` package (Toast's entrance/exit slide and the platinum shine sweep, `overlay/Toast.tsx`) and plain Tailwind CSS `transition`/`hover:` utilities (18 files, e.g. `CoverFan.tsx`'s `transition hover:-translate-y-1`).

Two mechanisms, both automatic:

- **Global CSS**, added to `src/renderer/src/styles/index.css`:
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
  This alone neutralizes every Tailwind-driven transition/animation across all 18 files with zero per-component changes.
- **`<MotionConfig reducedMotion="user">`** (from `motion/react`) wrapping each of the two React roots: `src/renderer/src/main.tsx` (main window) and `src/renderer/src/overlay/main.tsx` (the overlay window — a separate root, so it needs its own wrapper). This is the `motion` package's own built-in mechanism: it disables transform-based animation on `motion.*` components (Toast's slide, the shine sweep) while preserving simple opacity fades, matching the library's own accessibility guidance. No changes needed inside `Toast.tsx` itself.

Not touched: `src/main/overlay-service.ts`'s `EXIT_ANIMATION_MS = 400` (main process). With reduced motion the toast becomes visually inert almost instantly; the window stays technically open up to 400ms longer than necessary, which is imperceptible. Threading a reduced-motion flag into the main process for this is not worth it.

## 2. High contrast

Checked: computed WCAG contrast ratios for every color-token pairing actually used for text or UI components in `styles/index.css` (canvas/surface-1/2/3 backgrounds against fg/fg-muted/fg-subtle, every rarity color and its `on-rarity` pairing, primary/on-primary, platinum/on-platinum, success/warning/danger/info, and the platform brand colors). 23 of 24 pairings clear AA (4.5:1 normal text / 3:1 large text and UI components) with wide margins (7:1–18:1). One fails:

| Token pairing | Ratio | Where it's actually used as small text |
|---|---|---|
| `fg-subtle` (`#626b82`) on canvas/surface-1/2/3 | 3.1–3.7:1 | `AccountCard.tsx`'s stat `<dt>` labels (11px), `Toast.tsx`'s platform/time line (11px), `AchievementRow.tsx`'s description line (`text-xs`) |

These are below the 18px/14px-bold threshold that would let them use the relaxed 3:1 "large text" allowance, so they need the full 4.5:1.

**Fix:** brighten the `--color-fg-subtle` token itself (not each call site) from `#626b82` to `#888fa0` — the point where it clears 4.5:1 even against the lightest background it's paired with (`surface-3`, `#222839`; 4.53:1 there, 6.11:1 against canvas). One CSS variable change in `styles/index.css`, fixing every current and future use of the token at once, matching CLAUDE.md's design-token convention (never hard-code hex colors per call site). No other token needs to change.

**Windows "Increase contrast" mode** (`forced-colors: active`): Electron/Chromium already swaps most rendering to system colors automatically here (`forced-color-adjust: auto` is the default and nothing in this codebase overrides it — checked). Checked every use of `outline-none` in the renderer: there is exactly one (`NavSearch.tsx`'s search input), and its parent `<label>` already carries a substitute focus indicator (`focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary`), so removing the input's own default outline is intentional and already has a visible replacement — no fix needed. The app's status badges and rarity chips already pair color with an icon or text label, not color alone, so no separate fix is needed there for WCAG 1.4.1 (Use of Color). **No code changes needed for forced-colors mode** — this section is a verification, not a fix.

## 3. ARIA fixes

- **`EmptyState.tsx`**: currently wraps a `<p>` "heading" inside a `role="status"` live region (a static description, not a live announcement). Fix: drop `role="status"` from the wrapper, change the heading text to a real `<h2>` (matching the `font-display text-xl font-bold` styling it already has, and matching how `AccountCard.tsx` uses `<h3>` for its own card headings), keep the body as `<p>`.
- **`Onboarding.tsx`'s step indicator**: the circle (a literal `✓` once passed, or the step number) and the connector bar between circles are purely decorative — each step already has a visible, readable `<span>{s.label}</span>` beside it that conveys the same information. Fix: add `aria-hidden="true"` to the circle `<span>` and the connector `<span>`, so a screen reader announces only the label text per step, not "check mark" or an unlabeled bar.

## Tests

- `styles/index.css` changes are pure CSS/tokens — no test (CLAUDE.md: "pure styling needs no test, say so").
- `EmptyState.test.tsx`: update the existing test's query from `getByRole('status')` to a heading query (`getByRole('heading', { name: ... })`) plus a body-text assertion; the three consumers' tests (`Dashboard.test.tsx`, `Library.test.tsx`, `Activity.test.tsx`) that currently assert against `role="status"` need the same query update — check each.
- `Onboarding.test.tsx`: no behavioral change (aria-hidden elements aren't part of the accessible tree, so no new assertions are needed there beyond optionally confirming the hidden elements are `aria-hidden`).
- No test for the CSS media queries or `MotionConfig` wrapping — these are structural/config, not component behavior; verified by reading the rendered app (checked live per CLAUDE.md's UI-change rule), not a Vitest assertion.

## Docs to update when built

PROJECT-MAP.md's `styles/index.css` row (line 414) currently says `.bg-aurora` is "defined, not applied yet" — already stale before this pass (it's used by `App.tsx` and `Onboarding.tsx`); update that line and add a mention of the reduced-motion/forced-colors media queries and the `fg-subtle` fix. ROADMAP.md (tick the M5 item). CLAUDE.md status paragraph.
