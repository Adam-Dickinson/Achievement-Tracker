# ADR-0007: Providers refresh their own credentials; the scheduler saves them

- **Status:** Accepted
- **Date:** 2026-09-24

## Context

Steam's secret is an API key that never changes, so the scheduler only reads secrets: each account round builds `AccountCredentials` from the `SecretStore`, and only the Accounts flow saves one.

Xbox (docs/PROVIDERS.md, verified 2026-09-24) signs in with Microsoft OAuth. The stored secret is a refresh token, and **every refresh returns a new refresh token**. The API calls need an XSTS token, which lasts about 16 hours and takes three requests to get (access token, Xbox user token, XSTS). If the new refresh token is never saved, the app keeps using the first one, and the user has to sign in again when it expires (about 90 days for Microsoft accounts; whether the old one keeps working after a refresh is unverified). PlayStation's tokens (M3) behave the same way.

Rule 1 says providers are pure adapters with no storage knowledge; rule 3 says secrets go only through the `SecretStore`.

A second, smaller gap: `AuthInput`'s `oauth_callback` carries only a redirect URL, but a PKCE sign-in also needs the code verifier and the redirect URI used.

## Options considered

| Option | Result |
|---|---|
| **Optional `refresh()` on `AchievementProvider`; the scheduler calls it and saves a changed secret** | Providers stay pure; saving stays in one place; PlayStation reuses it |
| Give the Xbox provider a "save secret" callback | Smaller change, but the provider starts knowing about storage |
| Never save the rotated token | The user signs in again every ~90 days even when the app runs daily |

## Decision

- `AchievementProvider` gets an optional `refresh?(credentials, signal): Promise<AccountCredentials>`. At the start of each account round, if the provider has it, the scheduler calls it, saves the returned `secret` to the `SecretStore` when it differs from the stored one, and uses the returned credentials for the round.
- A provider may keep short-lived tokens (Xbox: the XSTS token and user hash) **in memory**, keyed by account, until they expire. `refresh()` then returns the same credentials without a network call, so the token chain runs about once a day, not every round. Only the long-lived secret (the refresh token) is stored.
- If the refresh itself is rejected (for example Microsoft's `invalid_grant`), `refresh()` throws `ProviderError('auth_expired')`, and the account goes to `needs_reauth` as today. A `401` on an API call clears the in-memory session so the next round refreshes.
- `AuthInput` replaces `oauth_callback` with `{ kind: 'oauth_code', code, redirectUri, codeVerifier }`. A main-process sign-in module runs the browser and the loopback server and holds the PKCE verifier; the provider only exchanges the code. Opening the browser stays out of the provider.

## Consequences

**Positive:**

- The provider never touches storage, and the scheduler is the one place secrets get written during sync.
- The same mechanism serves PlayStation and any later OAuth provider.

**Negative / to accept:**

- One more optional method on the interface, and the scheduler and its tests change.
- The in-memory session is lost on restart, so the first round after a restart runs the token chain (three requests).
- If the app crashes after Microsoft issues a new refresh token but before it is saved, the stored token is the older one. If Microsoft rejects old tokens, the user has to sign in again. Saving straight after `refresh()` returns keeps that window small.

## Revisit if

- Microsoft is found to keep old refresh tokens valid indefinitely, making saving optional.
- A provider needs to refresh in the middle of a round rather than at its start.
