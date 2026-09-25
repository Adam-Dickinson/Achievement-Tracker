# Provider Integration Notes

> **Read this first:** Most of these platforms do **not** offer an official public API for a user's own achievements. Entries marked *unofficial* rely on reverse-engineered endpoints that can change or break, and may conflict with the platform's terms of service. Endpoints and file paths below are from prior knowledge and **must be verified in a research spike** (M3 for Epic, Ubisoft and EA, ADR-0008) before implementation. Treat them as starting points, not facts.

## Summary matrix

| Provider | Official API? | Auth | Detection | Reliability | Priority |
|---|---|---|---|---|---|
| Steam | Yes (Web API) | User's own Web API key + SteamID | Poll + local stats files | High | P0 |
| RetroAchievements | Yes | Username + Web API key | Poll | High | After v1 |
| RPCS3 | n/a (local) | none | File watch | Medium | After v1 |
| Xbox | Partly (Xbox Live services, community-documented) | Microsoft OAuth, Xbox/XSTS tokens | Poll | Medium | P0 |
| PlayStation | No (unofficial) | NPSSO token, then access token | Poll | Medium-Low | P0 |
| Xenia | n/a (local) | none | File watch / log | Low, spike | After v1 |
| Epic Games | No (unofficial, the Epic launcher's own services) | Browser sign-in, pasted authorization code, then launcher OAuth tokens | Poll | Medium | P1, feasible (verified 2026-09-25) |
| Ubisoft Connect | No (unofficial, the Ubisoft Connect launcher's own services) | Ubisoft's sign-in page in an app window, then remember-me tickets traded for launcher sessions | Poll | Medium-Low | P1, feasible (verified 2026-09-25) |
| EA app | No | Unknown | Unknown | Very low | P1 spike |

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

- **Local (real-time):** Steam's `appcache/stats/` folder holds binary-VDF stats files per user/app (`UserGameStats_<accountid>_<appid>.bin` and `UserGameStatsSchema_<appid>.bin`). Watching them gives instant unlock detection, but they don't reveal *what* changed without diffing against the schema. *(Verify format.)*
  - **Seen 2026-09-23 on a real Windows install:** the Steam folder comes from `HKCU\Software\Valve\Steam\SteamPath` (`c:/program files (x86)/steam`); `appcache/stats` held 366 files, and the file for a game played that evening (Rainbow Six Siege, 359550) had been rewritten during the session. **Not yet verified:** whether Steam rewrites it at the moment of an unlock or only when the game saves its stats.
  - **Seen 2026-09-25** (a timing script outside the app, `tests/fixtures/_raw/steam-timing.mjs`, git-ignored): launching a game, playing for 1.5 minutes without unlocking anything and quitting did **not** rewrite its stats file, neither at launch nor on exit. Steam writes the file only when stats or achievements change, so a change is a real signal. The account's files are `UserGameStats_<accountid>_<appid>.bin`, where `accountid` is the SteamID64 minus 76561197960265728; 183 of them for the test account.
- **Running game:** `HKCU\Software\Valve\Steam\RunningAppID` holds the appid of the game Steam is running as a `REG_DWORD`, `0` when none. **Verified 2026-09-25:** it changed from `0` to the game's appid (1888930) when the game started and back to `0` about a second after it quit. `HKCU\Software\Valve\Steam\ActiveProcess\ActiveUser` holds the signed-in account's 32-bit `accountid`. Reading Steam's registry key is not reading the game, so it stays within rule 4.
- **Built (M2):** `SteamProvider.watch()` (`providers/steam/local.ts`) watches `appcache/stats` and reports a game 500 ms after its file last changed; it reads `RunningAppID` every 5 s and, while it is not 0 and `ActiveUser` is this account, reports that game at once and then every 30 s (about 3,000 requests a day while playing, well within the limit). The Scheduler syncs each reported game straight away (`syncGameNow`).
- **Still to verify with a real unlock:** whether Steam rewrites the stats file at the moment of the unlock or later, and how soon `GetPlayerAchievements` shows it. The app logs each unlock it finds as `Steam unlock found at <time>: <game>, "<name>", unlocked at <time> (N s earlier)` in the terminal running `npm run dev`; that line gives the delay (ROADMAP M2).
- **Risks:** API rate limits (~100k calls/day, be conservative), and possibly private profiles if the own-key result above turns out to be caching.

## RetroAchievements (after v1)

- Official Web API at retroachievements.org (user gets an API key in their settings). Calls include recent achievements, user completion progress, game info and achievement lists. *(Verify current endpoint names.)*
- Covers RetroArch, DuckStation, PPSSPP, PCSX2, Dolphin and others that integrate RA, so one provider covers many emulators.
- **Plan:** poll recent achievements every 30-60 s while an RA-capable emulator process runs, otherwise every few minutes.

## RPCS3 (after v1)

- Trophy data stored per user under RPCS3's `dev_hdd0/home/<user>/trophy/<NPWR-ID>/` (`TROPCONF.SFM`, `TROPUSR.DAT`, `TROPHY.TRP`-derived icons/names). Community-documented binary formats. *(Verify.)*
- **Plan:** auto-detect RPCS3 install dir (config + common paths, manual override), watch trophy dirs, parse `TROPUSR.DAT` for unlock flags/timestamps and `TROPCONF.SFM` (XML) for names, descriptions and grade.
- **Risks:** format changes between RPCS3 versions, so pin fixtures from real files. RPCS3 also logs trophy events, which is a potential fallback signal.

## Xbox (P0)

### Xbox Live: verified 2026-09-24

Captured against a real account (66 titles in its history, PC Game Pass) with a script that is not part of the app (`tests/fixtures/_raw/xbox-capture.mjs`, git-ignored). Sanitized replies are in `tests/fixtures/xbox/`: the sign-in replies with fake tokens (`ms-token`, `ms-refresh`, `user-token`, `xsts`), four titles from the history (two with Xbox achievements, two without), five Call of Duty achievements (a Common and a Rare unlock, one in progress, one secret, one locked), two trimmed pages of Forza Horizon 6, and the empty reply a wrong contract version gives. The XUID, gamertag and user hash are fake.

- **Status: unofficial.** These are Xbox Live's own services, documented by Microsoft for its partners (the GDK docs). Signing in to them from our own app works, but it is meant for approved partners, so the provider is opt-in and labelled like PlayStation (rule 5). No password is ever seen or stored.
- **Our Azure app:** registered in the Azure portal as "Achievement Tracker (dev)", **Personal accounts only**, redirect URI `http://localhost` on the **Public client/native (mobile & desktop)** platform. Its client ID is not a secret; the app ships it. There is no client secret. Registering needed no approval and no paid subscription.
- **Sign-in** (all verified):

  | Step | Request | Reply |
  |---|---|---|
  | 1. Browser sign-in | `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize` with `client_id`, `response_type=code`, `redirect_uri=http://localhost:<any port>`, `scope=XboxLive.signin offline_access`, PKCE (`code_challenge`, `S256`), `state` | Redirects to the loopback address with `code` and `state`. The `consumers` authority is needed; the scope needs no setup in the portal |
  | 2. Code for tokens | `POST .../consumers/oauth2/v2.0/token` (form): `client_id`, `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, `scope` | `access_token` (`expires_in` 3599 s), `refresh_token`, `scope` "XboxLive.signin" |
  | 3. Refresh | Same URL: `grant_type=refresh_token`, `refresh_token`, `client_id`, `scope` | A new access token **and a new refresh token**: save the new one every time |
  | 4. Xbox user token | `POST https://user.auth.xboxlive.com/user/authenticate`, `x-xbl-contract-version: 1`, JSON `{"Properties":{"AuthMethod":"RPS","SiteName":"user.auth.xboxlive.com","RpsTicket":"d=<access token>"},"RelyingParty":"http://auth.xboxlive.com","TokenType":"JWT"}` | `Token`, `NotAfter` (**4 days**), `DisplayClaims.xui[0].uhs`. The `d=` prefix is required for our own app |
  | 5. XSTS token | `POST https://xsts.auth.xboxlive.com/xsts/authorize`, `x-xbl-contract-version: 1`, JSON `{"Properties":{"SandboxId":"RETAIL","UserTokens":["<user token>"]},"RelyingParty":"http://xboxlive.com","TokenType":"JWT"}` | `Token`, `NotAfter` (**about 16 hours**), `DisplayClaims.xui[0]` with `gtg` (gamertag), `xid` (XUID), `uhs` (user hash) and others |

- **Calling the APIs:** header `Authorization: XBL3.0 x=<uhs>;<XSTS token>`, plus `x-xbl-contract-version` and `Accept-Language`. The XSTS claims already give the gamertag and XUID, so `validate()` needs no profile call.
- **Endpoints** (all JSON):

  | Endpoint | Contract | Used for | What we saw |
  |---|---|---|---|
  | `https://titlehub.xboxlive.com/users/xuid(<xuid>)/titles/titlehistory/decoration/achievement,image,detail` | 2 | `listGames()` | `{ xuid, titles[] }`, every title in one reply (66). Each has `titleId` (a **string** of digits), `name`, `devices` (`PC`, `XboxOne`, `XboxSeries`, `Win32`), `displayImage`, `images[]` (types include `BoxArt`, `Poster`, `SuperHeroArt`, `TitledHeroArt`), `titleHistory.lastTimePlayed` (ISO) and `achievement` (below) |
  | `https://achievements.xboxlive.com/users/xuid(<xuid>)/achievements?titleId=<id>` | **4** | `fetchGame()` | `{ achievements[], pagingInfo: { continuationToken, totalRecords } }`, every achievement locked or not, **32 per page** by default |
  | `https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag` | 2 | not needed | `profileUsers[0].id` is the XUID |

- **Title art** (checked on four titles): `TitledHeroArt` is 1920x1080 with the game's logo, the closest match to Steam's header, so it is the cover (then `SuperHeroArt`, 3840x2160 or 1920x1080; then `BoxArt`, square; then `displayImage`). `displayImage` is square (300 or 2160 px), so it is the icon. The URLs come as **`http://`** on `store-images.s-microsoft.com`, which the app's CSP (`img-src https:`) would block; the same paths work over `https://`. That host resizes: `?w=920` gave 920x518 (159 KB instead of 597 KB), `?w=128&h=128` gave 128x128.
- **Only games that were played are listed.** The history holds titles the account has launched, not everything it owns or the Game Pass catalogue. A game shows up once it is first launched, and the baseline cutoff (ADR-0005) makes its first unlocks toast.
- **`achievement.sourceVersion`** tells titles apart: `2` = Xbox achievements (13 titles), `0` = no Xbox achievements (53, PC games the Xbox app has seen, such as Destiny 2 or Rainbow Six Siege). Only list `2`. Version `1` (Xbox 360 titles) did not appear; the account has none, so the Xbox 360 format is **not verified**.
- **`achievement.totalAchievements` is unreliable:** it was `0` for every title with at least one unlock (Call of Duty: 28 unlocked, total 0). `currentAchievements`, `currentGamerscore`, `totalGamerscore` and `progressPercentage` looked right. For the real count use the achievements reply's `pagingInfo.totalRecords`.
- **The contract version matters:** v2 has no rarity; **v4** returns the same fields plus `rarity` (`currentCategory` and `currentPercentage`, e.g. 64.86) on every achievement. **v3 and v5 answer HTTP 200 with no achievements** (`totalRecords` 0), so a wrong version looks like a game with no achievements instead of failing.
- **Rarity categories are only "Common" and "Rare"**, and "Rare" means under 10% (9.91% was Rare, 11.78% Common; 214 achievements across two games). Use `currentPercentage` with our own thresholds (`shared/rarity.ts`) and ignore the category.
- **Paging:** `continuationToken` is an offset as a string ("32"); pass it back as `&continuationToken=`. It is `null` on the last page. With `maxItems=1000` (v4) a whole game came back in one reply: 157 of 157 for Call of Duty, 57 of 57 for Forza Horizon 6.
- **Achievement fields** (121 checked across two games): `id` (a string, "1"), `name`, `description`, `lockedDescription`, `isSecret`, `progressState` (`Achieved`, `InProgress`, `NotStarted`), `progression.timeUnlocked`, `progression.requirements[]` (`current` and `target` as **strings**, e.g. "66"/"100"), `rewards[]` (`type` "Gamerscore", `value` a **string**, "10"), `mediaAssets[]` (one `Icon`, on `images-eds-ssl.xboxlive.com`), `titleAssociations`, `platforms`, `isRevoked`.
  - **A locked achievement has `timeUnlocked` "0001-01-01T00:00:00.0000000Z"**: map it to `null`. Every `Achieved` one had a real date.
  - The one secret achievement had the same text in `description` and `lockedDescription`.
  - Progress: `InProgress` achievements had a requirement such as 66/100; `NotStarted` ones 0/100; `Achieved` ones none.
- **Errors:** an invalid XSTS token gets **HTTP 401 with an empty body** and a `WWW-Authenticate: Token realm='xboxlive.com', error='token_required'` header. No rate-limit headers were seen on any reply.
- **Live run of the finished provider (2026-09-24):** the app's own sign-in (`XboxSignIn`, loopback redirect), then `authenticate`, `validate`, `refresh`, `listGames` and `fetchGame` for every game: 13 of 13 games, all with a cover and an icon (the history requested with `decoration/achievement,image`, without `detail`, which the app doesn't need), 1,193 achievements (138 secret, all with rarity, 1,187 with gamerscore), 79 unlocks, all dated, matching the history's `currentAchievements` totals. One request per game with `maxItems=1000`; 24 s for the whole run, no `429`.
- **Not yet verified:** rate limiting. Microsoft documents fine-grained limits per user and endpoint (a 15-second burst limit and a 5-minute sustained limit), answered with `429`. Also the Xbox 360 format, whether hidden titles (`titleHistory.visible`) are left out, and what an expired refresh token returns.
- **What we built:** browser sign-in with PKCE on a loopback redirect, handled in the main process (never in the renderer). Only the refresh token is stored, in the `SecretStore`. The provider's `refresh()` (ADR-0007) gets a fresh XSTS token from the refresh token (access token → user token → XSTS) and keeps it in memory until 5 minutes before it expires; the scheduler saves the rotated refresh token. A `401` from Xbox Live drops the in-memory session and retries once with a new one before reporting `auth_expired`. The library is the title history; each game is fetched with contract 4 and `maxItems=1000`, following `continuationToken` (at most 20 pages).

## PlayStation (P0)

- No official API. Community reverse-engineered PSN trophy endpoints, authenticated by the user copying their **NPSSO** cookie from a logged-in browser session, then exchanging it for an auth code and access/refresh tokens. Trophy list/titles/earned-state endpoints under `m.np.playstation.com/api/trophy/...`. *(Verify.)*
- Trophy tiers map to `tier` (bronze/silver/gold/platinum).
- **Plan:** NPSSO paste flow with clear instructions, keychain storage, polling with generous intervals. Console-to-PSN sync delay means unlocks appear after the console syncs, so it's not truly real-time (document this).
- **Risks:** ToS grey area, NPSSO expiry (about 2 months, re-auth prompt needed), and Sony may change or block endpoints. Clearly labelled as unofficial and opt-in.

## Xenia (after v1)

- Xbox 360 emulator. Achievement data lives in emulated profile/GPD files (Xenia Canary tracks unlocks). Need to confirm where and in what format, and whether unlock times are recorded. Log-tailing is a fallback.
- **Spike output:** file locations, format description, sample fixture, feasibility verdict.

## Epic Games (P1): verified 2026-09-25, feasible

Spike C verdict: **feasible, unofficial.** Captured against a real account (317 library items in 209 namespaces, 46 games with Epic achievements, 66 unlocks in 2 of them) with scripts that are not part of the app (`tests/fixtures/_raw/epic-capture.mjs`, `epic-player.mjs`, `epic-rotation.mjs`, `epic-errors.mjs`, git-ignored). The approach follows the Playnite plugin SuccessStory ([EpicApi.cs](https://github.com/Lacro59/playnite-plugincommon/blob/master/CommonPluginsStores/Epic/EpicApi.cs)) and the open-source launchers Legendary and Heroic.

- **Status: unofficial.** Epic has no public API for a player's own achievements (Epic Online Services is for game developers). These are the Epic Games Launcher's own services, reached with the **launcher's client ID and secret** (`34a02cf8f4414e29b15921876da36f9a`, published by Legendary, Heroic and Playnite). Opt-in and labelled like Xbox (rule 5). No password is ever seen or stored.
- **Sign-in** (all verified):

  | Step | Request | Reply |
  |---|---|---|
  | 1. Browser | The user opens `https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b15921876da36f9a%26responseType%3Dcode` and signs in | A plain JSON page with `authorizationCode` (32 hex characters). There is no redirect to our app, so the user copies the code. It expires within minutes, and opening the page again issues a new one and voids the old |
  | 2. Code for tokens | `POST https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token`, header `Authorization: basic base64(clientId:secret)`, form `grant_type=authorization_code&code=<code>&token_type=eg1` | `access_token` (`token_type` "bearer", `expires_in` **129600 s = 36 h**), `refresh_token` (`refresh_expires` **31540000 s, about a year**), `account_id` (32 hex), `displayName`, and `expires_at`/`refresh_expires_at` as ISO dates |
  | 3. Refresh | Same URL, form `grant_type=refresh_token&refresh_token=<token>&token_type=eg1` | Same shape. **The refresh token rotates on every refresh** (the old one was still accepted straight afterwards), so save the new one each time (ADR-0007) |

  A used, expired or wrong code answers **400** `errors.com.epicgames.account.oauth.authorization_code_not_found`; a bad refresh token **400** `errors.com.epicgames.account.auth_token.invalid_refresh_token`.
- **Endpoints** (calls with a token send `Authorization: bearer <access token>`; SuccessStory's user agent, `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EpicGamesLauncher`, was used throughout):

  | Endpoint | Token | Used for | What we saw |
  |---|---|---|---|
  | `GET https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true&platform=Windows` (+ `&cursor=`) | yes | `listGames()` | `{ responseMetadata: { nextCursor }, records[] }`. Each record: `namespace` (the game's sandbox ID, 32 hex or a codename such as `jackal`), `catalogItemId`, `appName`, `sandboxName` (a good title, e.g. "Kingdom Come: Deliverance"), `productId`, `sandboxType` (all `PUBLIC`), `recordType` (all `APPLICATION`), `platform[]`, `acquisitionDate`. Several records can share a namespace (editions, DLC apps, and Unreal Engine and Fab items: "UE Marketplace", "fab-listing-live") |
  | `POST https://launcher.store.epicgames.com/graphql`, query `Achievement.productAchievementsRecordBySandbox(sandboxId, locale)` | **no** | schema + rarity | `productId`, `totalAchievements`, `achievements[].achievement`: `name` (the ID), `hidden`, `unlockedDisplayName`/`lockedDisplayName`, `unlockedDescription`/`lockedDescription`, `unlockedIconLink`/`lockedIconLink` (on `shared-static-prod.epicgames.com`), `XP`, `tier` (bronze/silver/gold...), `rarity.percent` (**on all 3,323 achievements seen**, 0 to 100). A hidden achievement (352 seen) has an empty locked name and description. A sandbox with no achievements, or an unknown one, answers HTTP 200 with every field `null` |
  | Same URL, query `PlayerAchievement.playerAchievementGameRecordsBySandbox(epicAccountId, sandboxId)` | yes | unlocks | `records: null` for a game never played; otherwise one record with `totalUnlocked` and `playerAchievements[].playerAchievement`: `achievementName`, `unlocked` (always true: **only unlocked achievements are listed**), `unlockDate` (ISO with milliseconds), `progress` (1), `XP`. SuccessStory's other query (`PlayerProfile.playerProfile.productAchievements(productId)`) gave identical unlocks but needs the `productId` from the schema first, and answers `ServiceError` for unplayed games and without a token |
  | `GET https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/<ns>/bulk/items?id=<catalogItemIds>&country=GB&locale=en-GB&includeMainGameDetails=true` | yes (sent) | cover art | Items keyed by ID, with `title` and `keyImages[]`: `DieselGameBox` (2560x1440, the cover) and `DieselGameBoxTall` (860x1148), on `cdn1.epicgames.com` over https |
  | `GET https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account/<accountId>/all` | yes | "played" signal | `[{ accountId, artifactId, totalTime }]`: `artifactId` is the library's `appName`, `totalTime` in seconds; 18 entries. **No last-played date** |

- **Only 46 of 209 namespaces have Epic achievements**, so the provider asks for each namespace's schema to know which to list. The schema needs no token and changes rarely, so it can be cached.
- **Errors:** an invalid token on the library answers **401** JSON `errors.com.epicgames.common.oauth.invalid_token`. On GraphQL it answers **HTTP 500 with an HTML page that loads hCaptcha**, not a 401, so the provider must refresh before the 36 h expiry rather than wait for a rejection. A malformed GraphQL query answers 400 with `errors[]`.
- **Rate limits:** none seen: about 300 requests at one every 300 ms, no `429` and no rate-limit headers.
- **Risks:** the launcher's client credentials could be rotated or blocked, and the hCaptcha page shows the GraphQL endpoint sits behind bot protection that could start challenging us.
- **Live run of the finished provider (2026-09-25):** `refresh` (with the saved refresh token), `validate`, `listGames` and `fetchGame` for every game: **47 games** (43 with a cover, 3 counted as recently played), **3,369 achievements** (352 hidden, all with rarity) and **66 unlocks, all dated**, matching the spike. A bad code gets "that sign-in code has expired or was already used". The first `listGames` took **85 s** (one achievement count per namespace, 209 of them, one at a time); the next, answered from the one-day cache, **3 s**.
- **Titles:** the library's `sandboxName` is a codename for about 20 of the 47 games ("Live", "yorkie Production", "Munster"), so the provider takes the title from the catalog (43 of 47; it gave "SUPER CRAZY RHYTHM CASTLE" for "Live"). For 4 games the catalog answers `{}` (Fallout: New Vegas, Europa Universalis IV, Death Stranding and one codename); the provider falls back to `sandboxName`, so one game still shows "yorkie Production". The catalog needs a token (401 without). One real title is "[REDACTED]", as Epic has it.
- **Covers:** `cdn1.epicgames.com` resizes with `?resize=1&w=920` (a 2560x1440 cover went from 760 KB to 124 KB; `?w=920` alone is ignored).
- **Not yet verified:** an achievement with progress (all 66 unlocks had `progress` 1), whether the game list needs Mac-only records filtered out (every record seen included Windows), and a refresh token at the end of its year.

## Ubisoft Connect (P1): verified 2026-09-25, feasible

Spike C verdict: **feasible, unofficial.** Captured against a real account (14 owned games, 10 with Ubisoft achievements, 79 unlocks) with Electron scripts that are not part of the app (kept in the session scratchpad; raw replies in `tests/fixtures/_raw/ubisoft/`, git-ignored). The endpoints and query shapes came from the Ubisoft Connect launcher's own cached web bundles (`%LOCALAPPDATA%\Ubisoft Game Launcher\cache\http2`), read for URLs and GraphQL query text only; its encrypted credential store (`ConnectSecureStorage.dat`) was not touched.

- **Status: unofficial.** Ubisoft has no public API for a player's own achievements. These are the services behind the Ubisoft Connect launcher and ubisoft.com, reached with the **launcher's app ID** (`f68a4bb5-608a-4ff2-8123-be8ef797e0a6`). Opt-in and labelled (rule 5). The password is typed into Ubisoft's own page and never reaches our code ([ADR-0009](adr/0009-ubisoft-sign-in-window.md)).
- **Local files:** the launcher keeps no achievement data on disk any more (no `cache/achievements`), so there is nothing to watch; the provider polls.
- **App IDs** (sent as `Ubi-AppId`):

  | App ID | Whose | Result |
  |---|---|---|
  | `1068ef52-dfd2-4e62-8ac9-37a47e6c0b78` | ubisoft.com's sign-in (the iframe on `www.ubisoft.com/en-gb/account/login`, reached from `https://account.ubisoft.com/login`) | Signs in. Its sessions list games, but achievements come back empty (`standardAchievements` 0/0) or refused (GraphQL error "401 Unauthorized from entitlement.api (errorCode=2000)", code `UNAUTHORIZED_USER`, HTTP 200) |
  | `f68a4bb5-608a-4ff2-8123-be8ef797e0a6` | The Ubisoft Connect launcher | Its sessions read achievements. A website remember-me ticket can be traded for one |
  | `314d4fef-e568-454a-ae06-43e3bece12a6` | The old web app ID in community tools (GOG Galaxy's plugin) | **Retired:** signing in answers **403** error **1002** "The Service: authentication, is not currently available for Application …" |

- **Sign-in and renewal** (all verified):

  | Step | Request | Reply |
  |---|---|---|
  | 1. Sign-in page | Ubisoft's page posts `POST https://public-ubiservices.ubi.com/v3/profiles/sessions` with `Ubi-AppId: 1068ef52-…`, `Authorization: Basic base64(email:password)` and reCAPTCHA, body with `rememberMe: true` | **200** with `ticket` (about 3,700 characters), `sessionId`, `rememberMeTicket` (about 720 characters), `userId` (a UUID; equal to `profileId` and to GraphQL's `viewer.id`), `nameOnPlatform`, `expiration` (**3 hours** after `serverTime`), `serverTime`, `twoFactorAuthenticationTicket` (null here), `sessionKey`, `spaceId`, `clientIp`. **A wrong password answers 403**, not 401. The app reads this reply only (ADR-0009) |
  | 2. Renewal | `POST https://public-ubiservices.ubi.com/v3/profiles/sessions`, `Ubi-AppId: f68a4bb5-…` (the launcher), `Authorization: rm_v1 t=<rememberMeTicket>`, body `{"rememberMe":true}` | **200**, the same shape, a new ticket for the launcher's app ID, and a **new `rememberMeTicket`**: it rotates on every renewal |
  | 3. Reuse | Renewing again with a remember-me ticket that was already used | **401** error **3** "Nonce was not found for the profile", **and the newest ticket is revoked too**: the account has to sign in again. So renewals must be one at a time and every new ticket saved (ADR-0007, ADR-0009) |

- **Endpoint:** everything else is one GraphQL endpoint, `POST https://public-ubiservices.ubi.com/v1/profiles/me/uplay/graphql`, with headers `Ubi-AppId: f68a4bb5-…`, `Authorization: Ubi_v1 t=<ticket>`, `Ubi-SessionId: <sessionId>`, `Ubi-LocaleCode: en-US`. Introspection is off ("GraphQL introspection is not allowed by Apollo Server") and wrong field names get no suggestions, so only query shapes the launcher itself uses were relied on.

  | Query | Used for | What we saw |
  |---|---|---|
  | `viewer { id name games(filterBy: { isOwned: true }) { nodes { id spaceId name avatarUrl backgroundUrl viewer { meta { id lastPlayedDate achievements { totalCount completedCount } } } } } }` | `validate()`, `listGames()` | All 14 owned games in one reply (the field takes no paging arguments; `first` is rejected), newest played first. `spaceId` is the game's ID (a UUID). `lastPlayedDate` is ISO with `Z` (2016 to 2026). `playTime` also exists (seconds, or null). **4 games have 0 achievements** (For Honor, and entries whose `platform.type` is PS3 or PS4). Images are on `ubiservices.cdn.ubi.com`: `backgroundUrl` is landscape art, `avatarUrl` a square icon; the CDN resizes with `?imwidth=` (the launcher uses it) |
  | `game(spaceId) { id viewer { meta { id achievements { totalCount completedCount nodes { id achievementId title description icon viewer { meta { id completionDate isCompleted } } } } } } }` (the launcher's `GetAchievements`; its optional `productId` was not needed) | `fetchGame()` | Every achievement with the player's state in one reply, no paging (92 in one game). `id` is `<uplay product id>-<n>` (for example `7013-1`). Every achievement had a title, description and icon. `completionDate` has **no time zone** (`2022-12-13T13:08:21`); read as UTC, unverified. A game Ubisoft does not know answers `game: null` |
  | `game(spaceId) { … standardAchievements(limit, nextToken) { … } }` (the launcher's `GetPlayerAchievements`) | not used | Returned 0 of 0 for every game on this account, with both app IDs |

- **Not available:** no rarity, no hidden or secret flag, no points and no progress on these achievements (all four field names tried were rejected).
- **Errors:** a bad ticket answers **401** `{"errors":[{"message":"Could not parse authorization header.","extensions":{"code":"INVALID_TICKET"}}]}`; the provider treats that code as an expired session even on a 200.
- **Rate limits:** none seen (about 60 requests in a few minutes, no `429`, no rate-limit headers).
- **Overlap with Steam:** several of these games (Assassin's Creed, Far Cry) are also Steam games; the Ubisoft achievements are Ubisoft's own set, so both are tracked until cross-platform linking (M4).
- **Risks:** Ubisoft could block the launcher's app ID for third parties (it already retired `314d4fef-…`); reCAPTCHA or other bot checks on the sign-in page could tighten; a lost rotated ticket forces a new sign-in.
- **Live run of the finished provider (2026-09-25):** connected from the Accounts screen through the sign-in window: **10 games** listed and synced (the 4 without achievements left out), **79 unlocks** matching the spike, all dated, and a silent first sync (no toasts, baseline rule).
- **Not yet verified:** the time zone of `completionDate` (needs a fresh unlock), how long a remember-me ticket lasts if unused, 2-step sign-in (this account was not asked for a code), and an account with social sign-in only.

## EA app (P1 spike)

- Very few EA titles have first-party achievements in the EA app, and there is no known user-facing API. Likely **not feasible**; many EA games use Steam achievements on PC, and console versions are covered by Xbox/PSN.
- **Spike output:** a documented "not supported" verdict is an acceptable outcome.

## Generic local-file adapter (after v1)

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
