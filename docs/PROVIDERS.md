# Provider Integration Notes

> **Read this first:** Most of these platforms do **not** offer an official public API for a user's own achievements. Entries marked *unofficial* rely on reverse-engineered endpoints that can change or break, and may conflict with the platform's terms of service. Endpoints and file paths below are from prior knowledge and **must be verified in a research spike** (M0/M5) before implementation. Treat them as starting points, not facts.

## Summary matrix

| Provider | Official API? | Auth | Detection | Reliability | Priority |
|---|---|---|---|---|---|
| Steam | Yes (Web API) | User's own Web API key + SteamID | Poll + local stats files | High | P0 |
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

### Web API: verified 2026-09-23

Captured against a real account (214 games) with the user's own key. Sanitized responses are in `tests/fixtures/steam/`.

- **Auth:** the user's own Web API key (steamcommunity.com/dev/apikey; Steam only issues one to accounts with Steam Guard that have spent at least $5) plus their SteamID64. Both go in the query string (`key=`, `steamid=`). There is no OAuth and no expiry; a key stops working only when the user revokes it. A public profile didn't turn out to be needed (see "Private profiles" below).
- **Endpoints** (host `https://api.steampowered.com`, all JSON):

  | Endpoint | Key? | Used for | What we saw |
  |---|---|---|---|
  | `ISteamUser/GetPlayerSummaries/v2/?steamids=` | yes | `validate()`: display name | `response.players[0].personaname`; `communityvisibilitystate` 3 = public |
  | `IPlayerService/GetOwnedGames/v1/?steamid=&include_appinfo=1&include_played_free_games=1` | yes | `listGames()` | `response.games[]`: `appid`, `name`, `img_icon_url` (a hash), `rtime_last_played` (Unix seconds, **0 = never played**), `has_community_visible_stats` (**`true` or absent**, never `false`; absent on 46 of 214 games) |
  | `IPlayerService/GetRecentlyPlayedGames/v1/?steamid=` | yes | `listGames()`: games borrowed through Steam Families | `response.games[]`: `appid`, `name`, `img_icon_url`, playtimes. Played in the last two weeks only; includes games the account doesn't own. No stats flag and no last-played time |
  | `ISteamUserStats/GetSchemaForGame/v2/?appid=&l=english` | yes | names, icons, hidden flag | `game.availableGameStats.achievements[]`: `name` (the id), `displayName`, `description`, `hidden` (**number 0/1**), `icon`, `icongray` (full URLs). **Hidden achievements have no `description` key at all.** A game without stats returns `{"game":{}}` with HTTP 200 |
  | `ISteamUserStats/GetPlayerAchievements/v1/?steamid=&appid=&l=english` | yes | unlock state | `playerstats.achievements[]`: `apiname`, `achieved` (0/1), `unlocktime` (Unix seconds, 0 when locked), `name`, `description` (`""` for hidden ones, even when unlocked) |
  | `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=` | **no** | rarity | `achievementpercentages.achievements[]`: `name`, `percent` as a **string** (`"49.8"`), one decimal place |

- **The ids line up:** schema `name` = player `apiname` = rarity `name`, with no extras on any side (checked on Resident Evil 2, 44 achievements).
- **Titles:** use the `GetOwnedGames` name. The schema's `gameName` can differ ("RESIDENT EVIL 2 / BIOHAZARD RE:2" vs "Resident Evil 2").
- **Game icon URL:** `https://media.steampowered.com/steamcommunity/public/images/apps/<appid>/<img_icon_url>.jpg` (HTTP 200, `image/jpeg`; the `cdn.cloudflare.steamstatic.com` host serves the same path).
- **Game cover (store header, 460x215):** `https://cdn.akamai.steamstatic.com/steam/apps/<appid>/header.jpg`, built from the appid alone. Verified 2026-09-23: HTTP 200 `image/jpeg` for appids 400, 6060, 883710, 1245620, 1817070 and 2358720, old and new; `shared.akamai.steamstatic.com/store_item_assets/steam/apps/<appid>/header.jpg` and the `cdn.cloudflare` host serve the same file, and `library_hero.jpg` (a wide banner) exists for all six. A game with no store page may have none, and on 2026-09-23 four of 171 games in a real library (recent releases) returned 404 at this address: newer store art lives at a hashed path (`store_item_assets/steam/apps/<appid>/<hash>/header.jpg`) that only the store API (`appdetails` → `header_image`) gives. The UI falls back to the title; fetching `header_image` is a later improvement.
- **`has_community_visible_stats` is a good filter:** every flagged game had a non-empty schema (168 of 168 in the live run below).
- **Unlock times:** no unlocked achievement had `unlocktime` 0, including Portal (2007), but map 0 to `null` anyway.
- **Errors** (these decide the `ProviderError` kind):

  | Situation | HTTP | Body |
  |---|---|---|
  | Bad or revoked key | 403 | HTML: "Access is denied. Retrying will not help. Please verify your `key=` parameter." |
  | No key | 400 | HTML: "Required parameter 'key' is missing" |
  | Rarity for an unknown app | **403** | JSON `{}`, so a 403 alone does **not** mean a bad key |
  | Player achievements for a game with no stats, or an unknown app | 400 | JSON `{"playerstats":{"error":"Requested app has no stats","success":false}}` |
  | SteamID that doesn't exist | 400 | HTML "Bad Request" (wording varies by endpoint) |

- **Private profiles:** with "Game details" set to Private, the account's **own** key got byte-for-byte the same responses from `GetPlayerSummaries`, `GetOwnedGames` and `GetPlayerAchievements` as when it was public (`communityvisibilitystate` still 3). So either a key can read its owner's private data or Steam caches the privacy change for a while; we didn't confirm which. Either way, the normal setup (your own key for your own account) doesn't appear to need a public profile. Using a key to read someone else's private profile is untested.
- **Live run of the finished provider (2026-09-23):** `authenticate`, `validate`, `listGames`, then `fetchGame` for every game in the library: 168 of 168 games fetched, 10,918 achievements (1,839 hidden, all with rarity), 1,480 unlocks (all dated), no failures. About 500 requests in a few minutes drew no `429`.
- **Steam Families (borrowed games), checked 2026-09-23:**
  - `GetOwnedGames` lists only games the account owns. Games borrowed from a family member's library are missing, even with `include_free_sub=1` and `skip_unvetted_apps=0`.
  - `IPlayerService/GetRecentlyPlayedGames/v1/?steamid=` (key needed) **does** list borrowed games played in the last two weeks: 3 of the 11 it returned weren't in the owned list. Its entries have `appid`, `name`, `img_icon_url` and playtimes, but **no** `has_community_visible_stats` or `rtime_last_played`.
  - For those borrowed games, `GetSchemaForGame`, `GetPlayerAchievements` and rarity all work normally with the player's own key (78, 59 and 64 achievements; 52, 5 and 0 unlocked).
  - `IFamilyGroupsService/GetFamilyGroupForUser` rejects a Web API key (HTTP 401, the same "verify your key" page as a bad key). The family endpoints need a user access token instead.
  - **With the store's access token (checked 2026-09-23, unofficial):** the `webapi_token` shown at `store.steampowered.com/pointssummary/ajaxgetasyncconfig` while logged in is a JWT for audience `web:store`, valid for **24 hours**. The login session behind it lasts about 135 days, but renewing the token needs that session (the browser's cookies), which we won't handle. With `?access_token=`:
    - `GetFamilyGroupForUser?steamid=` returns `family_groupid` and the members.
    - `GetSharedLibraryApps?family_groupid=&steamid=&include_own=true&include_excluded=true&include_free=true` returns every game in the family library (543 here, 335 not owned by the player), each with `appid`, `name`, `owner_steamids`, `img_icon_hash`, `rt_time_acquired`, and **the requesting player's own** `rt_last_played` and `rt_playtime` (they matched the player's `GetRecentlyPlayedGames` playtimes exactly).
    - 22 not-owned games had a non-zero `rt_last_played`, so the player had played them. **19 of those were last played more than two weeks ago**, so `GetRecentlyPlayedGames` can't find them.
    - Verdict: it finds every borrowed game the player has played, but a stored token would need replacing daily and can act as the account. If we use it, it should be a **one-off, opt-in import** (paste the token, find the played borrowed games, add them to the library, then drop the token without storing it). The found games are synced with the ordinary Web API key after that. Not built.
  - So with a Web API key, a borrowed game can only be **found** while it is in the two-week recently-played window. Once found, it can be synced like any other game. **What we built:** `listGames` merges the owned games that have stats with any recently played game the account doesn't own. Live, that took the library from 168 to 171 games, and the 3 borrowed games brought 57 unlocks. SPEC §5 requires found games to stay in the library after they leave that window. Borrowed games last played longer ago can't be found through the Web API; Steam's local `appcache/stats/UserGameStats_<accountid>_<appid>.bin` files (one per game played with stats, owned or not) are the likely way to find them. *(Verify.)*
- **Not yet verified:** how soon a game appears in `GetRecentlyPlayedGames` after it is first launched (at launch, after some minutes, or only on exit). This decides how quickly a newly borrowed game is found. To test: launch a never-played game and poll the endpoint every minute.
- **Not yet verified:** what rate limiting looks like (no `429` or `Retry-After` seen; Valve's terms say 100,000 calls a day per key). `api.ts` treats a `429` as `rate_limited` and honours `Retry-After` given in seconds or as a date.

### Local files and plan

- **Local (real-time):** Steam's `appcache/stats/` folder holds binary-VDF stats files per user/app (`UserGameStats_<accountid>_<appid>.bin` and schema files). Watching them gives instant unlock detection, but they don't reveal *what* changed without diffing against the schema. *(Verify format.)*
- **Plan:** poll Web API (fast when a game is running) plus optional local-file watcher to trigger an immediate poll.
- **Risks:** API rate limits (~100k calls/day, be conservative), and possibly private profiles if the own-key result above turns out to be caching.

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
