# ADR-0012: PlayStation signs in on Sony's page in an app window and keeps the 60-day npsso cookie

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

The PlayStation spike (see [PROVIDERS.md](../PROVIDERS.md#playstation-p0-verified-2026-09-25)) found PSN's trophy services usable with the PlayStation App's OAuth client (`ca.account.sony.com/api/authz/v3/oauth`). Two facts shape how a connection is kept:

- **The refresh token lasts 10 days and is never renewed.** `refresh_token_expires_in` is `863999` (10 days) at sign-in, and each refresh returns the *same* refresh token, still counting down. On its own it means signing in again every 10 days.
- **Sony's sign-in cookie `npsso` lasts 60 days** and mints a new authorization code on its own: `GET …/authorize` with `Cookie: npsso=…` answers `302` to the app's redirect with a `code`, which trades for a fresh 10-day refresh token. It works from Node with no browser, can be reused, is not rotated (Sony sets no new `npsso`), and minting does not revoke earlier refresh tokens. A refused `npsso` answers `302` to the sign-in page.

Community tools ask the user to copy `npsso` from `ca.account.sony.com/api/v1/ssocookie` in their own browser and paste it. The spike also showed a better way in: Sony's own sign-in page loads in a locked-down app window (with the plain Chrome user agent the Ubisoft and EA windows use), and after sign-in Sony redirects that window to the PlayStation App's redirect URI, `com.scee.psxandroid.scecompcall://redirect?code=…`, which the app can catch.

`npsso` is broader than a trophy token: it is Sony's web sign-in session. Rule 3 keeps secrets in the `SecretStore` (encrypted with `safeStorage`); rule 5 forbids storing a password.

## Options considered

| Option | For | Against |
|---|---|---|
| **Sign in on Sony's page in an app window; keep `npsso` (60 days) and mint refresh tokens from it** | One sign-in about every 2 months; no copying cookies from developer tools; the password stays on Sony's page | The stored secret is Sony's web session, broader than a trophy-reading token |
| Same window, keep only the refresh token | The stored secret is the narrower PlayStation App token | "Needs sign-in" every 10 days |
| Ask the user to paste `npsso` from `ssocookie` | What community tools do; no hosted page | Clumsy (sign in elsewhere, find a URL, copy 64 characters); easy to paste the wrong thing |
| Mint a new access token from `npsso` every hour, no refresh token | One code path | An authorization request to Sony's sign-in service every hour, where the PlayStation App uses its refresh token |

## Decision

**Sign in on Sony's own page in a locked-down app window, keep only the `npsso` cookie as the account's secret, and mint refresh tokens from it when needed.** The owner chose the 60-day option on 2026-09-25.

- **The window** is the generic cookie sign-in window (`src/main/cookie-sign-in-window.ts`, ADR-0010 and ADR-0011) with the same lock-down: sandboxed, no preload, a throwaway in-memory session that refuses every permission, pop-ups denied, the plain Chrome user agent. It may navigate only to `https://` addresses on `sony.com`. It opens `…/oauth/authorize` for the PlayStation App's client; when Sony redirects it to `com.scee.psxandroid.scecompcall://`, the window cancels that redirect, reads the session's `npsso` cookie, and closes. Only `npsso` leaves the window, wrapped in `Secret`. The one-time code in the redirect is not used, so there is a single way to mint tokens.
- **The provider** stores `npsso` (it never changes) and keeps everything else in memory, per account: the refresh token and when it expires, and the access token (1 hour). Following ADR-0007, only `refresh()` renews: it renews the access token from the refresh token, and mints a new refresh token from `npsso` when there is none (after a restart) or it has less than a day left. `listGames` and `fetchGame` use the cached access token only; a `401` drops it and throws a retryable error, so the next round renews.
- **When `npsso` is refused,** `refresh()` throws `ProviderError('auth_expired')` and the account goes to "needs sign-in"; connecting again replaces the secret.

## Consequences

**Positive:**

- One sign-in lasts about 60 days, with Sony's own page, codes and bot checks intact, and the app never sees the password.
- Nothing rotates, so there is no "a lost rotated credential means signing in again" risk (unlike EA and Ubisoft), and the stored secret never needs saving after sign-in.

**Negative / to accept:**

- The stored secret is Sony's web sign-in session. It is encrypted like every other secret, never logged (`Secret` redacts itself) and never sent anywhere but `ca.account.sony.com`.
- The 60 days run from sign-in; using the app does not extend them. The user signs in again about every 2 months.
- The app uses the PlayStation App's OAuth client id and secret, which are public (community-documented). Sony can change or block them.
- After a restart, the first round mints a refresh token (two requests) before it syncs.

## Revisit if

- Sony starts rotating `npsso`, binds it to a browser, or blocks minting from outside a browser.
- Sony lengthens the refresh token, or starts renewing it on refresh, making `npsso` unnecessary.
- A connected account is found to lose `npsso` well before 60 days (for example on signing in elsewhere).
