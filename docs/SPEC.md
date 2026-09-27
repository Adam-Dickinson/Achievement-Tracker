# Technical Specification

Version 0.1 (draft). Companion to [DESIGN.md](DESIGN.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Functional requirements

Priority: **P0** = MVP, **P1** = v1.0, **P2** = later.

### Accounts and providers
| ID | Requirement | Pri |
|---|---|---|
| F-01 | Connect/disconnect an account per platform; multiple accounts per platform allowed later | P0 |
| F-02 | Store credentials in OS keychain; never log them | P0 |
| F-03 | Detect expired/invalid auth and prompt re-auth without losing data | P0 |
| F-04 | Providers: Steam, Xbox, PlayStation | P0 |
| F-05 | Providers: Epic, Ubisoft, EA (subject to research spikes) | P1 |
| F-06 | Emulators: RetroAchievements, RPCS3, Xenia, and a generic "local file watcher" adapter for user-defined emulator paths (after v1, ADR-0006) | P2 |

### Sync
| ID | Requirement | Pri |
|---|---|---|
| F-10 | Initial full sync per account with progress reporting | P0 |
| F-11 | Incremental background sync on a schedule (default 5 min per provider) | P0 |
| F-12 | Fast polling (default 30-60 s) while a known game process is running | P1 |
| F-13 | Local-file providers use filesystem watchers (event-driven, no polling) | P0 |
| F-14 | Manual "Sync now" (all / per account / per game) | P0 |
| F-15 | Respect provider rate limits with backoff + jitter; surface status in UI | P0 |
| F-16 | Baseline rule: a game's first sync announces only unlocks dated after its cutoff, the previous library look (none when an account is first connected, so no flood) | P0 |
| F-17 | Sync is idempotent and resumable after crash | P0 |

### Notifications
| ID | Requirement | Pri |
|---|---|---|
| F-20 | Overlay toast on new unlock (transparent, click-through, always-on-top) | P0 |
| F-21 | Configurable corner, monitor, duration, scale, opacity | P1 |
| F-22 | Rarity tiers and per-tier sound | P1 |
| F-23 | Queue/stack/collapse logic for bursts | P0 |
| F-24 | Native OS toast fallback | P1 |
| F-25 | Do Not Disturb (manual, schedule) | P1 |
| F-26 | Test/preview notification button | P0 |

### Library and UI
| ID | Requirement | Pri |
|---|---|---|
| F-30 | Dashboard, Library, Game detail, Activity, Accounts, Settings screens | P0 |
| F-31 | Search, filter, sort across all games and achievements. Built for the Library (games) and Game detail (one game's achievements), in the UI ([ADR-0014](adr/0014-virtualized-lists-client-side-filtering.md)); one search across every game's achievements is not built | P1 |
| F-32 | Cross-platform game linking (auto + manual). Built: same cleaned title links automatically; merge and unlink on Game detail ([design](superpowers/specs/2026-09-26-game-linking-design.md)) | P1 |
| F-33 | Global achievement rarity display where the platform provides it | P1 |
| F-34 | JSON/CSV export | P2 |
| F-35 | A platinum for every game: a game's own "unlock everything" achievement counts as its platinum, and a game without one earns an app-awarded Platinum at 100%, shown in Game detail, Activity and toasts ([design](superpowers/specs/2026-09-27-platinum-design.md)) | P2 |

### Desktop integration
| ID | Requirement | Pri |
|---|---|---|
| F-40 | System tray with menu; close button minimizes to tray | P0 |
| F-41 | Start with OS (opt-in), start minimized | P0 |
| F-42 | Single instance enforcement | P0 |
| F-43 | Auto-update (signed) | P1 |
| F-44 | Running-game detection via process list | P1 |

## 2. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| N-01 | Idle CPU (tray, no sync) | < 0.5% average |
| N-02 | Idle memory in the tray (main window closed) | ≤ 200 MB private (measured baseline: ~170 MB, 4 processes; see ADR-0003 for tuning options) |
| N-03 | Unlock-to-toast latency, local providers | < 2 s |
| N-04 | Unlock-to-toast latency, polling providers | ≤ poll interval + 5 s |
| N-05 | Installer size | < 120 MB (Electron bundles Chromium) |
| N-06 | Cold start to tray | < 3 s |
| N-07 | Handles libraries of 5,000+ games / 200,000+ achievements smoothly (virtualized lists) | |
| N-08 | Works offline: shows cached data, queues sync | |
| N-09 | No game process injection or memory reading, ever | |
| N-10 | Crash in one provider never affects others (isolated tasks) | |

## 3. Domain model

```
Platform  = steam | xbox | playstation | epic | ubisoft | ea | retroachievements | rpcs3 | xenia | local_file
```

### SQLite schema (initial)

```sql
CREATE TABLE account (
  id            INTEGER PRIMARY KEY,
  platform      TEXT NOT NULL,
  external_id   TEXT NOT NULL,          -- steamid64, xuid, PSN account id, RA username, ...
  display_name  TEXT NOT NULL,
  status        TEXT NOT NULL,          -- connected | needs_reauth | error | disabled
  last_sync_at  TEXT,                   -- ISO-8601 UTC
  created_at    TEXT NOT NULL,
  UNIQUE (platform, external_id)
);                                       -- secrets live in secrets.json, encrypted by the OS (DPAPI), keyed by account.id

CREATE TABLE game (                      -- canonical (cross-platform) game
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  sort_title    TEXT NOT NULL,
  cover_url     TEXT,
  release_year  INTEGER
);

CREATE TABLE platform_game (             -- a game as it exists on one platform/account
  id            INTEGER PRIMARY KEY,
  game_id       INTEGER NOT NULL REFERENCES game(id),
  account_id    INTEGER NOT NULL REFERENCES account(id),
  platform      TEXT NOT NULL,
  external_id   TEXT NOT NULL,          -- appid, titleId, NPWR id, RA game id
  title         TEXT NOT NULL,
  icon_url      TEXT,
  baseline_done INTEGER NOT NULL DEFAULT 0,   -- 0 = first sync pending
  last_played   TEXT,
  baseline_cutoff TEXT,                 -- first sync toasts only unlocks after this; NULL = fully silent (0002)
  cover_url     TEXT,                   -- this entry's cover (0003; game.cover_url is no longer read)
  linked        TEXT NOT NULL DEFAULT 'auto', -- auto | manual: manual entries are never regrouped (0003)
  store_url     TEXT,                   -- the game's store page, when its platform has one (0007): steam://nav/games/details/<appid> or https://www.xbox.com/games/store/_/<ProductId>
  UNIQUE (account_id, external_id)
);

CREATE TABLE game_alias (                -- cleaned titles that lead to a game (0003)
  match_key TEXT PRIMARY KEY,
  game_id   INTEGER NOT NULL REFERENCES game(id)
);

CREATE TABLE artwork (                   -- SteamGridDB lookups by cleaned title (0004)
  match_key  TEXT PRIMARY KEY,
  url        TEXT,                        -- NULL = nothing found; asked again after 30 days
  checked_at TEXT NOT NULL
);
-- 0005 clears Steam cover_url values on the old /steam/apps/<appid>/header.jpg path (dead for newer games).

CREATE TABLE achievement (
  id               INTEGER PRIMARY KEY,
  platform_game_id INTEGER NOT NULL REFERENCES platform_game(id),
  external_id      TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  icon_url         TEXT,
  icon_locked_url  TEXT,
  hidden           INTEGER NOT NULL DEFAULT 0,
  points           INTEGER,             -- gamerscore / RA points / null
  tier             TEXT,                -- trophy grade (bronze..platinum) or null
  global_percent   REAL,                -- rarity 0-100 if known
  UNIQUE (platform_game_id, external_id)
);

CREATE TABLE unlock (
  id             INTEGER PRIMARY KEY,
  achievement_id INTEGER NOT NULL UNIQUE REFERENCES achievement(id),
  unlocked_at    TEXT,                  -- as reported by platform (may be null)
  detected_at    TEXT NOT NULL,         -- when WE saw it
  notified       INTEGER NOT NULL DEFAULT 0,
  progress_cur   INTEGER,               -- for progressive achievements
  progress_max   INTEGER
);

CREATE TABLE sync_state (
  account_id   INTEGER NOT NULL REFERENCES account(id),
  scope        TEXT NOT NULL,           -- 'library' | 'game:<external_id>'
  cursor       TEXT,                    -- provider-specific etag/timestamp
  last_ok_at   TEXT,
  last_error   TEXT,
  next_due_at  TEXT,
  PRIMARY KEY (account_id, scope)
);

CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- JSON values

CREATE TABLE platinum (                  -- app-awarded Platinums (migration 0006)
  platform_game_id INTEGER PRIMARY KEY REFERENCES platform_game(id),
  earned_at        TEXT,                 -- the entry's latest unlock (null if none is dated)
  detected_at      TEXT NOT NULL         -- when the app awarded it
);

CREATE INDEX idx_unlock_detected ON unlock(detected_at DESC);
CREATE INDEX idx_pgame_game ON platform_game(game_id);
```

## 4. Provider interface (TypeScript)

```ts
export interface AchievementProvider {
  readonly platform: Platform
  readonly capabilities: ProviderCapabilities // localWatch, polling, globalRarity, oauth, unofficial

  authenticate(input: AuthInput, signal?: AbortSignal): Promise<AccountCredentials>
  validate(credentials: AccountCredentials, signal?: AbortSignal): Promise<AccountInfo>

  /** All games with any achievement data for this account. */
  listGames(credentials: AccountCredentials, signal?: AbortSignal): Promise<readonly RemoteGame[]>

  /** Full schema + unlock state for one game. */
  fetchGame(credentials: AccountCredentials, game: RemoteGameRef, signal?: AbortSignal): Promise<RemoteGameAchievements>

  /** Optional: event-driven sources signal changes instead of being polled. Returns a stop function. */
  watch?(credentials: AccountCredentials, onChange: (game: RemoteGameRef) => void): () => void

  /** Optional (ADR-0007): renew short-lived tokens; the scheduler saves a changed secret. */
  refresh?(credentials: AccountCredentials, signal?: AbortSignal): Promise<AccountCredentials>
}

type AuthInput =
  | { kind: 'api_key'; key: Secret; accountId: string }
  | { kind: 'token'; value: Secret }
  | { kind: 'oauth_code'; code: string; redirectUri: string; codeVerifier: Secret } // ADR-0007
  | { kind: 'local_path'; path: string }
```

The real definitions are in `src/shared/provider.ts`. The Scheduler calls `refresh` at the start of each account round and saves the returned secret if it changed (ADR-0007); the Xbox provider implements it.

- Providers are **pure adapters**: they return normalized `Remote*` objects and know nothing about SQLite or notifications
- Failures are thrown as `ProviderError` with a `kind`: `auth_expired`, `rate_limited` (with `retryAfterMs`), `network`, `parse`, `unsupported`, `other`. The sync engine maps these to backoff, re-auth prompts or UI status. `isRetryable` is true for `network` and `rate_limited`.
- Watchers only signal "something changed for this game"; the sync engine re-fetches and diffs, so the baseline rule and de-duplication live in one place
- Each provider has fixture-based tests (recorded, sanitized responses in `tests/fixtures/`)

## 5. Sync algorithm

```
for each due (account, scope):
    remote = provider.fetch_*()
    db.begin()
      upsert games / achievements (schema data)
      for each remote unlock not in db:
          insert unlock(detected_at = now)
          if platform_game.baseline_done: enqueue UnlockEvent
      if !baseline_done: set baseline_done = 1     // silent first pass
    db.commit()
    emit UnlockEvents -> notification service (after commit, so no ghost toasts)
    schedule next_due_at (fast if game running, else normal; backoff on error)
```

Unlocks are keyed by `(achievement_id)` (unique), so retries and duplicate watcher events are safe.

**As built (M1, game scope).** One pass is `runSyncPass` in `src/main/sync/sync-pass.ts`; *when* passes run is the `Scheduler` in `src/main/sync/scheduler.ts`. Its SQL is in `src/main/store/sync-store.ts`.

- **Scopes.** Each account round starts with the `library` scope: `listGames`, then `addPlatformGames` in one transaction, which adds new games and updates known ones. Then each `platform_game` row is its own scope, `game:<externalId>`. Both use the outcomes table below. Decided in [ADR-0005](adr/0005-library-scope-baseline-cutoff-tiered-polling.md).
- **A found game is never forgotten.** When the library scope is built, a game that stops appearing in `listGames` must keep its `platform_game` row and go on being synced. `listGames` is not a complete list: Steam's includes games borrowed through Steam Families only while they are in the two-week recently-played window (docs/PROVIDERS.md), and refunded or delisted games can also drop out. Removing a game is a user action, never a side effect of a sync.
- **Baseline cutoff (F-16).** A game added by a library look gets `baseline_cutoff` = the previous look's `last_ok_at`; on the account's first look it is `NULL`. A game's first sync announces only unlocks dated after the cutoff. Undated unlocks, and all of them when the cutoff is `NULL`, are recorded silently. So connecting an account stays silent, while a game bought or borrowed later toasts what was unlocked since the app last looked.
- **Tiered polling.** A game the platform counts as recently played (`RemoteGame.recentlyPlayed`; Steam: in `GetRecentlyPlayedGames`; Xbox: last played within 14 days, from the title history) syncs every interval; any other game at most every 6 hours after its last success (`IDLE_INTERVAL_MS`). This keeps Steam around 12,000 requests a day for 171 games instead of about 148,000 (the key's limit is 100,000). Until the library has been read in the current session, every game counts as recent.
- **Fetch first.** The provider call happens *before* `BEGIN`. `node:sqlite` transactions are synchronous, so one must never stay open across a network await.
- **Loops.** `start()` runs one loop per `connected` account whose platform has a registered provider. Each round syncs that account's due games in turn (no `next_due_at` means due now), then sleeps until the earliest next due time. `stop()` (on quit) clears the timers and aborts any provider call in flight through its `AbortSignal`.
- **Credentials.** The token comes from `SecretStore`, keyed by `String(account.id)` (see §3).
- **Refreshing credentials (ADR-0007).** Before the library scope, `refreshCredentials` calls the provider's optional `refresh`. A secret that comes back different (Xbox rotates its refresh token) is saved at once, and the rest of the round reads it from the store. A failure is recorded against the `library` scope with the outcomes below, and the round goes no further.

| Outcome of a pass | `sync_state` | Next attempt |
|---|---|---|
| Success | `last_ok_at` = now, `last_error` cleared | normal interval (5 min, §7 `sync.intervalSec`), or the idle interval (6 h) for a game not played lately; backoff reset |
| `ProviderError` that is retryable (`network`, `rate_limited`) | `last_error` set | exponential backoff, 30 s doubling to 30 min, or the platform's `retryAfterMs` if longer, plus up to 20% random jitter so failed games don't all retry at once |
| `ProviderError('auth_expired')` | `last_error` set; `account.status` = `needs_reauth` | none: the account's loop stops until it is reconnected |
| Any other error (`parse`, `unsupported`, a bug) | `last_error` set | normal interval |
| Cancelled by `stop()` | unchanged | none |

On a failure `last_ok_at` and `cursor` keep their previous values. Backoff attempt counts live in memory only, so a restart starts them again.

- **Watches (M2).** `start()` and `startAccount()` also start the provider's optional `watch()` for each connected account; `stop()` and an expired login stop it. A watch only reports "this game may have changed"; `syncGameNow(accountId, gameId)` then syncs that game at once, outside the loop, with the same pass, outcomes and baseline rule. It skips a game that is backing off after an error. A game not in the library yet (bought or first launched since the last look) triggers one library look first, unless the library is backing off; if the look doesn't list it either, it is not looked for again until the next regular library look. Reports that arrive while that game is syncing lead to exactly one more sync. Steam's watch reports a changed stats file and, every 30 s, the game Steam is running (F-12; PROVIDERS.md, Steam).
- **Platinums (F-35).** `isPlatinumAchievement` (`store/platinum.ts`) says whether an achievement is its game's platinum: the platform's `platinum` tier, or, with no tier, a description of at most 90 characters saying "all"/"every" then up to four filler or game-title words then "achievements"/"trophies" (the full rule is in the design). It is applied wherever achievements are read, so nothing about it is stored. After storing a pass's unlocks, `awardPlatinum` adds a `platinum` row for an entry whose achievements are all unlocked and none of which is a platinum; the pass then appends a stand-in `UnlockEvent` (`externalId` `trophy-locker:platinum`, name "Platinum", tier `platinum`) only if it announced at least one unlock, so a first sync stays silent. At startup `awardPlatinums` awards every qualifying entry silently. The row stays if DLC later adds achievements; disconnecting and removing an account's games deletes its rows.
- **Unlock timing.** Each `UnlockEvent` carries the platform's `unlockedAt` next to `detectedAt`, and `main/index.ts` logs both for every unlock (`unlock-timing.ts`).

- **Manual syncs (F-14).** `syncAccountNow(accountId)` runs a round at once in which the library is read and every game is synced, ignoring the idle interval and any backoff; asked during a round, it runs exactly one more round straight after. `syncAllNow()` does that for every connected account, and `syncGameNow(accountId, gameId, true)` syncs one game past its backoff. Afterwards games go back to their normal pace.
- **Stopping one account.** Each account has its own abort signal. `stopAccount(accountId)` (used by Disconnect) aborts its in-flight calls, cancels its timer and stops its watch; `startAccount` gives it a fresh signal when it is connected again. A loop also stops by itself once its account is no longer `connected`.
- **Progress (F-10).** `isSyncing(accountId)` says whether a round is running, and `onSyncingChanged` fires when one starts or ends. An `AccountSummary` carries `checkedGames` (games with a `sync_state` row, so read at least once, successfully or not) and `lastSyncAt` (the latest `last_ok_at` of any scope).

**Not built yet:** fast polling for platforms other than Steam (F-12). `UnlockEvent`s go to the notification service (`main/notifications.ts`, see ARCHITECTURE §3).

## 6. IPC contract (main process ⇄ UI)

The UI has no Node.js access. It calls the main process through `window.api`, which the preload script builds from the contract in `src/shared/ipc.ts` (channel names and payload types shared by all three sides). Every handler validates that the sender is one of our own pages, and payloads from the UI are checked with a zod schema in `main/ipc.ts` before anything uses them.

**Implemented**
| API (`window.api`) | Channel | Description |
|---|---|---|
| `getAppInfo()` | `app:get-info` | App version and database schema version |
| `getProfile()` | `profile:get` | `Profile`: the saved name (`name`, or `null`) and the Windows user's name (`windowsName`, empty if the system can't say). The app shows the saved name, else the Windows name: in the nav's avatar and at the top of the Library |
| `setProfileName(name)` | `profile:set-name` | Saves the name (trimmed, at most 40 characters; empty clears it, back to the Windows name) in the `setting` table under `profile.name`, and returns the new `Profile`. Anything else is ignored and the profile returned unchanged |
| `sendTestNotification()` | `notifications:send-test` | Queue the next sample toast (cycles rarity tiers). Shown even while notifications are paused |
| `getNotificationsPaused()` | `notifications:get-paused` | Whether notifications are paused (the tray's Pause notifications, the nav's bell). Not kept across restarts |
| `setNotificationsPaused(paused)` | `notifications:set-paused` | Pause or resume notifications; anything but a boolean is ignored. Updates the tray's checkbox and fires `onNotificationsPausedChanged` |
| `onNotificationsPausedChanged(listener)` | `notifications:paused-changed` (main → main window) | Called with the new value whenever notifications are paused or resumed, from the app or the tray. Returns an unsubscribe function |
| `listLibrary()` | `library:list` | Every game as a `LibraryGame`, linked platforms counted once: its id is the canonical **game** id; `platforms` (best first), the best entry's unlocked/total and cover (else any entry's), the shortest entry title, the latest unlock across entries; most recently unlocked first |
| `getGame(id)` | `library:get-game` | One game (by game id) with its `entries`, best first: each platform entry's id, platform, `tag` (set when two entries share a platform, e.g. `PS4`), counts, achievements (each with `platinum`) `appPlatinum` (`{ earnedAt }` when the entry was awarded one and has no platinum of its own, else `null`) and `hasStorePage` (`GameDetail`), or `null`. The id is checked with zod (a positive integer) |
| `mergeGames({ intoGameId, gameId })` | `library:merge-games` | Moves every entry of `gameId` into `intoGameId` (both then `manual`) and moves its cleaned titles too, so later entries with those titles join. Ids are positive integers and must differ, otherwise ignored. Fires `onDataChanged` |
| `openStorePage(platformGameId)` | `library:open-store-page` | Opens the entry's store page with the system (Steam's client, or the browser for xbox.com). The UI sends only the entry id; the main process reads the stored link and opens it only if it matches an allowed pattern (`main/store-page.ts`). Anything else is ignored |
| `unlinkGame({ platformGameId })` | `library:unlink-game` | Moves one entry to a game of its own (`manual`, no cleaned titles, so nothing joins it automatically). Ignored for a game's only entry or a bad id. Fires `onDataChanged` |
| `getArtworkSettings()` | `artwork:get-settings` | `ArtworkSettings`: whether a SteamGridDB key is saved, how many games have no artwork, and the last run's problem (`key_refused`, `unreachable` or `null`). Never the key |
| `saveSteamGridDbKey({ key })` | `artwork:save-steamgriddb-key` | Checks the key with SteamGridDB (one search), saves it in the `SecretStore` and looks for missing artwork (ADR-0013). The key is trimmed and must be 16-64 letters and digits, else `invalid_input`. Answers `ArtworkKeyResult`: `{ ok: true }` or `{ ok: false, reason: invalid_input | key_rejected | network | other, message }` |
| `removeSteamGridDbKey()` | `artwork:remove-steamgriddb-key` | Deletes the key; found artwork stays |
| `findMissingArtwork()` | `artwork:find-missing` | Looks up every game with no artwork now (one run at a time) and answers `ArtworkRun`: `{ found, checked }` |
| `getDashboard()` | `dashboard:get` | `DashboardStats`: totals (each game counted once, by its best copy: the highest unlocked share, then the most unlocked, so other copies of a game never inflate them), completed games, unlocks today, `week` (a count for each of the last seven local days, oldest first; "this week" is their sum), `streakDays` (days in a row with an unlock, up to today, or up to yesterday while today has none yet; for these day counts an achievement unlocked on several copies of a game counts once, on the day it was first earned), `unlockedByRarity` (the best copies' unlocks per rarity tier, leaving out ones with no rarity), `platinums` (platform entries with an unlocked own platinum plus those with an app-awarded one), per-platform progress (games, unlocked and total for each platform with games, most unlocked first), "Nearly there", recent unlocks, and `rarestUnlock` (the unlock with the lowest global percentage, the newest on a tie, with its game's cover; achievements with no rarity left out; the date may be `null`; `null` when there is none), and `rarestThisWeek` (the lowest global percentage among unlocks since the start of the seven-day window, for the Activity header; `null` when there is none) |
| `listActivity(limit)` | `activity:list` | `ActivityPage`: the newest `limit` dated items across every platform, and `hasMore`. An item is a `RecentUnlock` (`kind: 'achievement'`, with its description, `platinum`, its game id and its platform entry id) or a `RecentPlatinum` (`kind: 'platinum'`, a dated app-awarded Platinum, placed just above the unlock that earned it). The limit is checked with zod (a whole number from 1 to `MAX_ACTIVITY_LIMIT`, 1,000); anything else answers an empty page. The screen asks for 50 more at a time rather than passing a cursor, so a refresh after a sync reloads everything it shows |
| `onDataChanged(listener)` | `data:changed` (main → main window) | Called when synced data may have changed (a library look found games, a game synced, an account lost its login), at most once a second, so open screens reload. Returns an unsubscribe function |
| `onToasts(listener)` | `overlay:set-toasts` (main → overlay) | Subscribe to the toasts on screen: the whole list (`VisibleToast[]`, oldest first, at most 3) each time it changes. Returns an unsubscribe function |
| `listAccounts()` | `accounts:list` | Every account as an `AccountSummary`: platform, display name, status, number of games, how many of them have been read (`checkedGames`), the last successful sync (`lastSyncAt`) and whether it is syncing now (`syncing`). Never the key |
| `disconnectAccount({ accountId, keepData })` | `accounts:disconnect` | Stops syncing the account (`stopAccount`) and deletes its secret. `keepData: true` marks it `disabled` and keeps its games, achievements and unlocks; `false` deletes them, the account, its sync state, and any canonical game left with no entry. Checked with zod (a positive id and a boolean), otherwise ignored. Fires `onDataChanged` |
| `syncNow(scope)` | `sync:now` | `{ kind: 'all' }` or `{ kind: 'account', accountId }` starts a manual round (F-14) and answers at once; `{ kind: 'game', gameId }` syncs that canonical game's entries on connected accounts, forced, and answers when they are done. Checked with zod, otherwise ignored |
| `connectSteam({ steamId, apiKey })` | `accounts:connect-steam` | Checks the key with Steam, saves the account (reconnecting keeps its id) and the key (`SecretStore`), and starts syncing it. Returns a `ConnectResult`: `{ ok: true, account }` or `{ ok: false, reason, message }` with `reason` `invalid_input`, `key_rejected`, `cancelled`, `network` or `other`. A result rather than a thrown error, because across IPC an error keeps only its message |
| `connectXbox({ acceptedUnofficial: true })` | `accounts:connect-xbox` | Opens the Microsoft sign-in in the user's browser (PKCE, a one-shot loopback server on `127.0.0.1`), then signs in to Xbox Live, saves the account (keyed by XUID, named by gamertag) and the refresh token, and starts syncing it; the main window comes back to the front when it finishes. Refused with `invalid_input` unless `acceptedUnofficial` is exactly `true` (rule 5). A cancelled, timed-out (5 minutes) or declined sign-in answers `cancelled` |
| `cancelXboxSignIn()` | `accounts:cancel-xbox-sign-in` | Stops a sign-in that is waiting for the browser; its `connectXbox` call answers `cancelled` |
| `connectUbisoft({ acceptedUnofficial: true })` | `accounts:connect-ubisoft` | Opens Ubisoft's own sign-in page in a locked-down app window (ADR-0009), takes the remember-me ticket from Ubisoft's reply, trades it for a launcher session, saves the account (keyed by Ubisoft user ID, named by Ubisoft name) and the rotated remember-me ticket, and starts syncing it. Refused with `invalid_input` unless `acceptedUnofficial` is exactly `true` (rule 5). Closing the window or cancelling answers `cancelled`, and so does a sign-in not finished within 10 minutes |
| `cancelUbisoftSignIn()` | `accounts:cancel-ubisoft-sign-in` | Closes a waiting Ubisoft sign-in window; its `connectUbisoft` call answers `cancelled` |
| `connectEa({ acceptedUnofficial: true })` | `accounts:connect-ea` | Opens EA's own sign-in page in a locked-down app window that may navigate only within `ea.com` (ADR-0010), takes only the `sid`, `remid` and `_nx_mpcid` cookies once the window is back on `www.ea.com`, trades them for a token, saves the account (keyed by EA account ID `pd`, named by EA display name) and the rotated cookies, and starts syncing it. Refused with `invalid_input` unless `acceptedUnofficial` is exactly `true` (rule 5). Closing the window or cancelling answers `cancelled`, and so does a sign-in not finished within 10 minutes |
| `cancelEaSignIn()` | `accounts:cancel-ea-sign-in` | Closes a waiting EA sign-in window; its `connectEa` call answers `cancelled` |
| `connectPlayStation({ acceptedUnofficial: true })` | `accounts:connect-playstation` | Opens Sony's own sign-in page (the PlayStation App's authorization page) in a locked-down app window that may navigate only within `sony.com` (ADR-0012). When Sony redirects the window to the PlayStation App's address, the window cancels that redirect, takes only the `npsso` cookie and closes; the provider mints tokens from it, then the account is saved (keyed by PSN account ID, named by online ID) with `npsso` as its secret, and syncing starts. Refused with `invalid_input` unless `acceptedUnofficial` is exactly `true` (rule 5). Closing the window or cancelling answers `cancelled`, and so does a sign-in not finished within 10 minutes |
| `cancelPlayStationSignIn()` | `accounts:cancel-playstation-sign-in` | Closes a waiting PlayStation sign-in window; its `connectPlayStation` call answers `cancelled` |
| `signInToSteam({ includeFamily, acceptedUnofficial: true })` | `accounts:sign-in-to-steam` | Opens Steam's own sign-in page in a locked-down app window that may navigate only within `steampowered.com`/`steamcommunity.com` (ADR-0011) and keeps only the `steamRefresh_steam` cookie. From it: the SteamID, and the account's Web API key read from `steamcommunity.com/dev/apikey` with a community session. Then it connects the account as `connectSteam` does, keeps the refresh token beside the key when `includeFamily` is true (the family library), and starts a library look at once. An account without a key answers `other` with how to create one. Refused with `invalid_input` unless `acceptedUnofficial` is exactly `true` and `includeFamily` is a boolean; closing the window, cancelling or 10 minutes without a sign-in answer `cancelled` |
| `cancelSteamSignIn()` | `accounts:cancel-steam-sign-in` | Closes a waiting Steam sign-in window; its `signInToSteam` call answers `cancelled` |
| `openEpicSignIn()` | `accounts:open-epic-sign-in` | Opens Epic's sign-in page in the user's browser. After signing in, Epic shows a page with a one-time `authorizationCode` for the user to copy |
| `connectEpic({ code, acceptedUnofficial: true })` | `accounts:connect-epic` | Takes the pasted text (the 32-character code, or the whole page Epic showed), swaps the code for tokens, saves the account (keyed by Epic account ID, named by display name) and the refresh token, and starts syncing it. Refused with `invalid_input` unless `acceptedUnofficial` is exactly `true` (rule 5) or when the text holds no code; a used or expired code answers `code_rejected` |

**Planned** (added in the milestones that need them)
| API | Description |
|---|---|
| `getSettings()` / `updateSettings(patch)` | |
| `exportData(format)` | |

**Events** (main → UI, via `webContents.send`): `sync:status` (per-account progress/state), `achievement:unlocked`, `account:status-changed`, `settings:changed`.

## 7. Settings (defaults)

```jsonc
{
  "startup":       { "launchAtLogin": false, "startMinimized": true },
  "sync":          { "intervalSec": 300, "gameRunningIntervalSec": 45, "pauseOnBattery": false },
  "notifications": {
    "enabled": true, "corner": "bottom-right", "monitor": "primary",
    "durationSec": 5, "scale": 1.0, "opacity": 1.0,
    "sound": { "enabled": true, "volume": 0.6 },
    "fallbackNativeToast": true,
    "perPlatform": {}, "minRarity": "common", "dnd": { "manual": false }
  },
  "appearance":    { "theme": "system" }
}
```

## 8. Security requirements

- **Renderer isolation:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; the UI only gets the explicit `window.api`. New windows and navigation away from our own pages are blocked.
- **CSP:** a strict Content-Security-Policy is injected into production builds (`script-src 'self'`, no remote content).
- **IPC:** validate the sender of every call; validate and narrow every payload in the main process (never trust the renderer).
- **Secrets** only via `SecretStore`. In production that is `SafeStorageSecretStore`: each secret is encrypted with Electron `safeStorage` (Windows DPAPI, so only the same Windows user can decrypt it) and kept as base64 in `secrets.json` in the app's data folder, never in SQLite. It refuses to save if OS encryption is unavailable, and a secret it can't decrypt reads as missing, so the account asks for its key again; `Secret` redacts itself in strings, JSON and `console.log`, so never log credentials; redact tokens in any logs.
- **Auth flows** (OAuth) run in the system browser (loopback redirect) or a separate short-lived window, and are closed after completion.
- **The overlay** only changes its own window; nothing is injected into other processes.
- **Updates:** auto-update packages signed; signature verified before install (M6).
- **Local files:** parse untrusted files (trophy/stats binaries) defensively, with size limits, throwing `ProviderError('parse', ...)` rather than crashing.
- **Dependencies:** keep them patched (`npm audit` in CI is a candidate for M5).

## 9. Testing strategy

| Layer | Approach |
|---|---|
| Shared domain, sync engine | Vitest in Node; a fake `AchievementProvider` and an in-memory database |
| Store | Apply all migrations to an in-memory `node:sqlite` database; upgrade tests seeded at the previous version; failing migrations roll back |
| Providers | Fixture-driven tests using a stubbed `fetch`; parsers property-tested for binary formats |
| React components | Vitest + Testing Library in jsdom, with `window.api` faked |
| Whole app | Manual and scripted runs of the built app (launch, IPC, overlay window flags, close-to-tray, single instance); Playwright's Electron support is a candidate for automation |
| CI | GitHub Actions on Windows: `npm run format:check`, `lint`, `typecheck`, `test`, `build` |

## 10. Observability

- Structured logging to rolling files in the app data dir (a small logger or `electron-log`); log level setting; "Open logs folder" in Settings
- Per-provider health surfaced in the Accounts screen (last success, last error)
