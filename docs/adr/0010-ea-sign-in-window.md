# ADR-0010: EA signs in through its own page in an app window, keeping only its session cookies

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Spike C found the EA app **feasible** (see [PROVIDERS.md](../PROVIDERS.md#ea-app-p1-verified-2026-09-25-feasible)): EA's own services list a player's games, their achievement sets and unlocks, given a 4-hour token from `accounts.ea.com/connect/auth`. That endpoint issues tokens from EA's session cookies, with no password:

- `sid` (a session cookie) mints tokens on its own while EA's session lasts;
- `remid` (60 days) with `_nx_mpcid` (1 year) mints a token when `sid` has expired, and **rotates**: the reply sets a new `remid` and `sid`, and the old `remid` is refused from then on.

The cookies only exist after a sign-in on EA's page (`www.ea.com/login` → `signin.ea.com`, email, password, and a code when EA asks). As for Ubisoft ([ADR-0009](0009-ubisoft-sign-in-window.md)) there is no redirect back to the app and no code to paste. Two things differ from Ubisoft:

- **Nothing to read in a reply.** EA's page never hands its sign-in to a script; the result is the cookies EA leaves in the browser session.
- **The page navigates.** Signing in moves the whole window between `www.ea.com`, `accounts.ea.com` and `signin.ea.com` (form posts and redirects). The app blocks every top-level navigation (`main/index.ts`), which would stop the sign-in half-way.

Rule 5 forbids a provider that needs the user's password stored.

## Options considered

| Option | For | Against |
|---|---|---|
| **EA's page in a locked-down app window; keep only `sid`, `remid` and `_nx_mpcid`** | The user signs in on EA's real page (with its codes and bot checks); the app never sees the password; the same pattern as Ubisoft | The app reads cookies from a third-party page's session; the window has to be allowed to navigate within EA's sites |
| Sign in in the system browser, then paste cookies from its developer tools | The app never hosts the page | Unusable for most people; fragile |
| Read the EA app's stored sign-in on disk | No sign-in | Reads another app's secrets; only works where the EA app is installed |
| Mark EA "not supported" | Nothing to build or maintain | Drops a platform the spike showed is feasible |

## Decision

**Sign in on EA's own page, shown in a locked-down app window, and keep only the three sign-in cookies.** The owner chose this option on 2026-09-25.

The window (`src/main/ea-sign-in-window.ts`) is set up like the Ubisoft one: sandboxed, context isolation on, Node integration off, **no preload**, a fresh in-memory session per sign-in that refuses every permission request, pop-ups denied, and a plain Chrome user agent (EA's page stays blank with Electron's). In addition:

- **It may navigate, but only to `https://` addresses on `ea.com` or its subdomains.** `main/navigation.ts` keeps a per-window allow rule; the app-wide `will-navigate` handler still blocks everything else, for this window and every other. Links out of EA (Google or Apple sign-in, help pages) stay blocked.
- **It reads cookies, never the page.** When the window arrives back on `www.ea.com` after sign-in, it reads the session's cookies for the `ea.com` domain (whatever their path: `sid` and `remid` are set for `/connect`), and only `sid`, `remid` and `_nx_mpcid` leave the window, wrapped in `Secret` as one JSON value. The window then closes at once, so the ea.com home page (with its trackers) is not left running.

The provider stores that value as the account's secret and renews tokens with it, following ADR-0007 and ADR-0009's rules for rotating credentials:

- **Cookies only change in `authenticate()` and `refresh()`.** Every token request sends all three cookies and applies the `Set-Cookie` reply (a new `sid`, and a new `remid` when `sid` had expired) before anything else, and the Scheduler saves `refresh()`'s result (ADR-0007). `listGames` and `fetchGame` use the cached token only; if it is missing or rejected they drop it and throw a retryable error, so the next round's `refresh()` renews and saves in one step.
- **One token request per account at a time**, not cancelled half-way, since a lost rotated `remid` means signing in again.
- A token is kept until 30 minutes before it expires (tokens last 4 hours).

## Consequences

**Positive:**

- EA is supported without the app storing, seeing or handling a password, with EA's own codes and bot checks intact.
- The sign-in flow (`src/main/ea-sign-in.ts`) and the navigation rule are plain TypeScript and tested without Electron; only the thin window adapter needs a real run.

**Negative / to accept:**

- A second third-party page is hosted in the app, and this one may navigate within `ea.com`. It still runs with no bridge into the app and a throwaway session.
- The stored secret is a set of browser cookies. If EA changes their names or starts binding them to the browser, connected accounts will need to sign in again, and the provider may need updating.
- Not yet verified: whether reusing an old `remid` also revokes the newest one (Ubisoft's does), and how long `sid` lasts.
