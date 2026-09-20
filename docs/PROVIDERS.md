# Provider Integration Notes

> **Read this first:** Most of these platforms do **not** offer an official public API for a user's own achievements. Entries marked *unofficial* rely on reverse-engineered endpoints that can change or break, and may conflict with the platform's terms of service. Endpoints and file paths below are from prior knowledge and **must be verified in a research spike** (M0/M5) before implementation. Treat them as starting points, not facts.

## Summary matrix

| Provider | Official API? | Auth | Detection | Reliability | Priority |
|---|---|---|---|---|---|
| Steam | Yes (Web API) | User's Web API key + SteamID (public profile) | Poll + local stats files | High | P0 |
| RetroAchievements | Yes | Username + Web API key | Poll | High | P0 |
| RPCS3 | n/a (local) | none | File watch | Medium | P0 |
| Xbox | Partly (Xbox Live services, community-documented) | Microsoft OAuth, Xbox/XSTS tokens | Poll | Medium | P1 |
| PlayStation | No (unofficial) | NPSSO token, then access token | Poll | Medium-Low | P1 |
| Xenia | n/a (local) | none | File watch / log | Low, spike | P2 |
| Epic Games | No | Unknown | Unknown | Low | P2 spike |
| Ubisoft Connect | No | Unknown/unofficial | Unknown | Low | P2 spike |
| EA app | No | Unknown | Unknown | Very low | P2 spike |

**Coverage shortcut:** many PC titles from Epic/Ubisoft/EA also use **Steam achievements** if they're on Steam. The Steam provider covers those, so the store-specific providers only matter for store-exclusive achievements.

---

## Steam (P0)

- **Web API** (needs the user's own key from steamcommunity.com/dev/apikey; profile "Game details" must be public):
  - `IPlayerService/GetOwnedGames`: library (with `include_appinfo`)
  - `ISteamUserStats/GetPlayerAchievements`: unlock state + `unlocktime`
  - `ISteamUserStats/GetSchemaForGame`: names, descriptions, icons, hidden flag
  - `ISteamUserStats/GetGlobalAchievementPercentagesForApp`: rarity
- **Local (real-time):** Steam's `appcache/stats/` folder holds binary-VDF stats files per user/app (`UserGameStats_<accountid>_<appid>.bin` and schema files). Watching them gives instant unlock detection, but they don't reveal *what* changed without diffing against the schema. *(Verify format.)*
- **Plan:** poll Web API (fast when a game is running) plus optional local-file watcher to trigger an immediate poll.
- **Risks:** private profiles return empty data, and API rate limits (~100k calls/day, be conservative).

## RetroAchievements (P0)

- Official Web API at retroachievements.org (user gets an API key in their settings). Calls include recent achievements, user completion progress, game info and achievement lists. *(Verify current endpoint names.)*
- Covers RetroArch, DuckStation, PPSSPP, PCSX2, Dolphin and others that integrate RA, so one provider covers many emulators.
- **Plan:** poll recent achievements every 30-60 s while an RA-capable emulator process runs, otherwise every few minutes.

## RPCS3 (P0/P1)

- Trophy data stored per user under RPCS3's `dev_hdd0/home/<user>/trophy/<NPWR-ID>/` (`TROPCONF.SFM`, `TROPUSR.DAT`, `TROPHY.TRP`-derived icons/names). Community-documented binary formats. *(Verify.)*
- **Plan:** auto-detect RPCS3 install dir (config + common paths, manual override), watch trophy dirs, parse `TROPUSR.DAT` for unlock flags/timestamps and `TROPCONF.SFM` (XML) for names, descriptions and grade.
- **Risks:** format changes between RPCS3 versions, so pin fixtures from real files. RPCS3 also logs trophy events, which is a potential fallback signal.

## Xbox (P1)

- Xbox Live services (`achievements.xboxlive.com` and related) accessed with an XSTS token obtained via Microsoft OAuth, then Xbox user token, then XSTS. Needs correct `x-xbl-contract-version` headers. Widely used by community libraries, but not an officially supported public API for third-party desktop apps. *(Verify.)*
- Alternative: third-party proxy (e.g., OpenXBL) as a simpler auth path, at the cost of a dependency and rate limits.
- Covers Xbox consoles, Xbox PC / Game Pass titles. Gamerscore is available as `points`.
- **Plan:** OAuth in a sandboxed webview, store refresh token in the keychain, poll title history + per-title achievements.
- **Risks:** Azure app registration requirements and token refresh handling. Microsoft could restrict access.

## PlayStation (P1)

- No official API. Community reverse-engineered PSN trophy endpoints, authenticated by the user copying their **NPSSO** cookie from a logged-in browser session, then exchanging it for an auth code and access/refresh tokens. Trophy list/titles/earned-state endpoints under `m.np.playstation.com/api/trophy/...`. *(Verify.)*
- Trophy tiers map to `tier` (bronze/silver/gold/platinum).
- **Plan:** NPSSO paste flow with clear instructions, keychain storage, polling with generous intervals. Console-to-PSN sync delay means unlocks appear after the console syncs, so it's not truly real-time (document this).
- **Risks:** ToS grey area, NPSSO expiry (about 2 months, re-auth prompt needed), and Sony may change or block endpoints. Clearly labelled as unofficial and opt-in.

## Xenia (P2 spike)

- Xbox 360 emulator. Achievement data lives in emulated profile/GPD files (Xenia Canary tracks unlocks). Need to confirm where and in what format, and whether unlock times are recorded. Log-tailing is a fallback.
- **Spike output:** file locations, format description, sample fixture, feasibility verdict.

## Epic Games (P2 spike)

- Epic's launcher shows achievements, but there is no public user-facing API. Epic Online Services (EOS) achievements are developer-facing. Possibly reachable via undocumented launcher endpoints using the user's Epic session.
- **Spike questions:** is there a stable, non-ToS-violating way to read a user's own achievements? Which games actually have Epic achievements? If not viable, ship as "manual/none" and rely on Steam overlap.

## Ubisoft Connect (P2 spike)

- Ubisoft Connect has achievements/"challenges" served by Ubisoft services requiring an authenticated session; nothing public or documented. 2FA complicates any token flow.
- **Spike questions:** feasibility of a token-based session without storing the user's password; local cache files; overlap with Steam for the same titles.

## EA app (P2 spike)

- Very few EA titles have first-party achievements in the EA app, and there is no known user-facing API. Likely **not feasible**; many EA games use Steam achievements on PC, and console versions are covered by Xbox/PSN.
- **Spike output:** a documented "not supported" verdict is an acceptable outcome.

## Generic local-file adapter (P2)

User-defined watcher for emulators/tools that write achievements to a file: user picks the path, format (JSON/INI/XML with a small mapping config), and the adapter emits unlocks. Useful for long-tail emulators.

---

## Cross-cutting provider rules

1. Unofficial providers ship behind a per-provider "I understand this is unofficial" opt-in
2. Every provider has a `Capabilities` declaration so the UI adapts (e.g., no rarity column when unavailable)
3. Never store passwords. Use tokens/keys only, in the keychain.
4. Honor `Retry-After`; exponential backoff with jitter; cap concurrency per provider
5. Failure in one provider must never block another
6. Each provider ships with sanitized fixtures and parser tests before the network code is trusted
7. When a provider's API breaks, degrade to "needs attention" status with a clear message rather than silently failing
