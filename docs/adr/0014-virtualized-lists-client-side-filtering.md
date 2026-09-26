# ADR-0014: Long lists are virtualized with TanStack Virtual, and the Library is filtered in the UI

- **Status:** Proposed
- **Date:** 2026-09-26

## Context

M4's last item is "Search/filter/sort, virtualized lists". SPEC N-07 asks for libraries of 5,000+ games and 200,000+ achievements to stay smooth, and F-31 asks for search, filter and sort across games and achievements. DESIGN.md §5 lists the Library's sorts (recent, %, name, platform) and filters (platform, completed, in progress).

On the owner's real data, the Library has 516 games and the largest game (PAYDAY 2) has 1,342 achievements. Every Library card and every achievement row was rendered at once, so a 5,000-game library would put 5,000 cards (each with a cover image) into the page and re-render them all on every keystroke of a search.

The Library cards are a responsive grid (as many 15rem columns as fit) whose height depends on the window width, because covers keep their aspect ratio. The page scrolls in the app shell's `<main>`, not in the list.

Two things had to be decided: how to virtualize, and where filtering and sorting run. SPEC §6 had planned a `listGames(filter, sort, page)` IPC call that would filter in SQL.

## Options considered

**Virtualization**

| Option | For | Against |
|---|---|---|
| **`@tanstack/react-virtual`** (~15 KB, no dependencies) | Well known and maintained; measures real row heights, so rows can differ in height; works with an outer scroll element through `scrollMargin` | One more dependency; its hook trips the React Compiler lint rule `react-hooks/incompatible-library`, a warning, which `--max-warnings 0` turns into a failure |
| Hand-written virtualizer | No dependency, no lint exception | Row measurement, overscan and scroll maths to write and maintain; easy to get subtly wrong |
| `content-visibility: auto` in CSS | No JavaScript | Every card is still created by React and re-rendered on each keystroke; no fix for the render cost |
| `react-window` | Small | Fixed-size rows only, or a separate variable-size API with manual size caches |

**Filtering and sorting**

| Option | For | Against |
|---|---|---|
| **In the UI, over the list `listLibrary()` already returns** | No new IPC or SQL; instant as you type; counts per filter are cheap; linked games are already grouped | The whole list crosses IPC once per load (5,000 small objects, well under a megabyte) |
| In SQL through `listGames(filter, sort, page)` | Scales to any size | Each keystroke is an IPC round trip; grouping linked games (best entry, shortest title) lives in TypeScript today and would have to move into SQL or run after paging |

## Decision

**Long lists render through one `VirtualGrid` component built on `@tanstack/react-virtual`, and the Library and Game detail filter and sort in the UI.**

- `VirtualGrid` (in `components/`) chunks items into rows of as many columns as fit (a minimum column width, an optional maximum), virtualizes the rows against the app's scroll area (`<main>`, shared through `ScrollParentContext`), and measures each rendered row. It is used by the Library grid and the Game detail achievement list. The Activity page keeps its "Show more" paging (50 at a time, at most 1,000).
- Search, filters, sorts and their counts are plain functions (`library-view.ts`, `achievement-view.ts`) over the data the screens already load. The planned `listGames` and `listAchievements` IPC calls are dropped from SPEC §6.
- The one `useVirtualizer` call carries `// eslint-disable-next-line react-hooks/incompatible-library`. The rule warns that React Compiler will not auto-memoize a component that uses this hook. The project does not use React Compiler, so the warning has no effect here, and it cannot be fixed while using the library. This is the "unavoidable" case CLAUDE.md allows, recorded here.

## Consequences

- The Library renders about 25 cards and Game detail about 10 to 26 achievement rows at a time, whatever the size of the list (checked in the built app on the owner's data: 516 games, and PAYDAY 2's 1,342 achievements).
- Rows are placed from measured heights, with an estimate for rows not yet seen. Going back to the Library after opening a game restores the scroll position to within an estimate's error.
- Lists in jsdom have no layout, so component tests use `fakeLayout()` and `renderScrolled()` from `src/renderer/src/test/layout.tsx`.
- A list rendered outside a `ScrollParentContext` shows nothing. The app shell always provides one.
- One more renderer dependency to keep up to date.

## Revisit if

- The project turns on React Compiler (the lint exception then matters).
- Filtering in the UI becomes slow on a real library, or `listLibrary()` becomes too large to send whole (for example well past N-07's 5,000 games).
- A search across every game's achievements is wanted (F-31), which would need a new IPC query rather than the in-memory approach.
