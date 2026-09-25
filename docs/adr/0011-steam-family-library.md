# ADR-0011: The Steam family library through Steam's own sign-in, keeping its refresh token

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

The owner wants every game in their Steam family library tracked, played or never played, since those games are part of their library. With a Web API key Steam lists only owned games (`GetOwnedGames`) and games played in the last two weeks (`GetRecentlyPlayedGames`); borrowed games outside that window, and every never-played one, are invisible (PROVIDERS.md, Steam Families).

The spike on 2026-09-25 (PROVIDERS.md, "Steam family library") found:

- `IFamilyGroupsService/GetSharedLibraryApps` lists the whole family library (543 apps, 296 owned by other members, 286 of them never played by the owner), but refuses a Web API key: it needs a user access token.
- Signing in on `store.steampowered.com/login/` leaves a **refresh token** in the `steamRefresh_steam` cookie on `login.steampowered.com` (a JWT for audiences `web`, `renew`, `derive`, valid about **7 months**) and a 24-hour access token in `steamLoginSecure`.
- The website renews the access token without the browser: `POST login.steampowered.com/jwt/ajaxrefresh` (with the refresh cookie and the store's `Origin`/`Referer`) returns a one-time ticket, and posting it to `store.steampowered.com/login/settoken` sets a new `steamLoginSecure`. The refresh token was **not** rotated. `IAuthenticationService/GenerateAccessTokenForApp` refuses web refresh tokens (EResult 15).
- Achievements of never-played games read normally with the owner's Web API key (every achievement, 0 unlocked). Which family games have achievements at all comes from the public store service (`IStoreBrowseService/GetItems`, category 22), with the game's schema for the few delisted games the store knows nothing about.

The refresh token is the most powerful credential the app would hold: it can derive web sessions that act as the Steam account on Steam's websites, not just read data like the Web API key.

## Options considered

| Option | For | Against |
|---|---|---|
| **Steam's page in a locked-down app window; keep the refresh token and renew 24-hour sessions from it** | Finds every family game, played or not, and new ones as the family adds them; no password seen | Keeps a credential that can act as the account; unofficial |
| One-off import: sign in, import the family library, keep nothing | Nothing powerful stored | Games added to the family later never appear until the next import |
| Scan Steam's local stats files | No sign-in | Finds only games already played, which is not what the owner asked for |
| Paste the store's `webapi_token` by hand | No window | Lasts 24 hours; unusable |

## Decision

**Sign in on Steam's own page in a locked-down app window and keep only the refresh token, beside the Web API key.** The owner chose this option on 2026-09-25, knowing the token can act as the account.

- **The window** is the same one EA uses, made generic: `main/cookie-sign-in.ts` (the flow) and `main/cookie-sign-in-window.ts` (sandboxed, no preload, a throwaway session, a plain Chrome user agent, and a per-window navigation rule, here `isSteamAddress`: `https://` on `steampowered.com` or `steamcommunity.com`). When the window is back on `store.steampowered.com` it reads the `steampowered.com` cookies and keeps only `steamRefresh_steam`.
- **Connecting** (`connectSteamFamily`) needs a connected Steam account and refuses a sign-in for a different SteamID. It proves the token works (one renewal) before saving, stores it in the Steam account's existing secret as `{ "key": …, "family": … }` (a plain key, as saved before, still reads as key-only), and asks the Scheduler for a library look straight away (`lookForGamesNow`).
- **The provider** mints a 24-hour session from the refresh token only in memory, one at a time, and replaces it an hour before it expires. It uses it for the two family endpoints and nothing else. On each library look it adds the family games that other members own, that are shareable (`exclude_reason` 0) and that have achievements; the rest of Steam still uses the Web API key.
- **Failure is contained.** If the family sign-in expires or is refused, `listGames` logs a warning and returns the usual games: the Steam account keeps syncing, and family games already found stay (a found game is never forgotten, SPEC §5). Surfacing "the family sign-in needs renewing" in the UI belongs with provider health (M5).
- **Found family games follow ADR-0005:** they arrive on a later library look, so their first sync announces only unlocks after that look's cutoff. Never-played games start at 0%.

## Consequences

**Positive:**

- The library includes every family game with achievements (215 more for the owner, most never played), and new family games appear on the next look.
- The Web API key keeps doing all achievement reads; the powerful token is used for two read-only calls.

**Negative / to accept:**

- The app stores a credential that can act as the Steam account on Steam's websites. It is encrypted with `safeStorage` like every secret, never logged, never sent to the renderer, and only ever posted to `login.steampowered.com` and `store.steampowered.com`.
- The renewal imitates the website (its `Origin` and `Referer` are required, or Steam answers 403). Valve could change or block it; the family library would then stop updating until the code follows.
- After about 7 months the refresh token expires and the owner has to sign in again; until the UI shows this, only the log says so.
- The library grows a lot (171 to 386 games for the owner); never-played games sit in the slow polling tier, so the extra syncing stays small.
