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
| F-04 | Providers: Steam, Xbox, PlayStation, RetroAchievements, RPCS3 | P0/P1 |
| F-05 | Providers: Xenia, Epic, Ubisoft, EA (subject to research spikes) | P2 |
| F-06 | Generic "local file watcher" adapter for user-defined emulator paths | P2 |

### Sync
| ID | Requirement | Pri |
|---|---|---|
| F-10 | Initial full sync per account with progress reporting | P0 |
| F-11 | Incremental background sync on a schedule (default 5 min per provider) | P0 |
| F-12 | Fast polling (default 30-60 s) while a known game process is running | P1 |
| F-13 | Local-file providers use filesystem watchers (event-driven, no polling) | P0 |
| F-14 | Manual "Sync now" (all / per account / per game) | P0 |
| F-15 | Respect provider rate limits with backoff + jitter; surface status in UI | P0 |
| F-16 | Baseline rule: first sync of a game emits no notifications | P0 |
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
| F-31 | Search, filter, sort across all games and achievements | P1 |
| F-32 | Cross-platform game linking (auto + manual) | P1 |
| F-33 | Global achievement rarity display where the platform provides it | P1 |
| F-34 | JSON/CSV export | P2 |

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
| N-02 | Idle memory, main window closed | < 100 MB total (app + WebView) |
| N-03 | Unlock-to-toast latency, local providers | < 2 s |
| N-04 | Unlock-to-toast latency, polling providers | ≤ poll interval + 5 s |
| N-05 | Installer size | < 30 MB |
| N-06 | Cold start to tray | < 2 s |
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
);                                       -- secrets live in the OS keychain, keyed by account.id

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
  baseline_done INTEGER NOT NULL DEFAULT 0,   -- 0 = silent first sync pending
  last_played   TEXT,
  UNIQUE (account_id, external_id)
);

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

CREATE INDEX idx_unlock_detected ON unlock(detected_at DESC);
CREATE INDEX idx_pgame_game ON platform_game(game_id);
```

## 4. Provider interface (Rust)

```rust
#[async_trait]
pub trait AchievementProvider: Send + Sync {
    fn platform(&self) -> Platform;
    fn capabilities(&self) -> Capabilities;     // { local_watch, polling, global_rarity, oauth, ... }

    async fn authenticate(&self, ctx: AuthContext) -> Result<AccountCredentials, ProviderError>;
    async fn validate(&self, creds: &AccountCredentials) -> Result<AccountInfo, ProviderError>;

    /// All games with any achievement data for this account.
    async fn list_games(&self, creds: &AccountCredentials) -> Result<Vec<RemoteGame>, ProviderError>;

    /// Full schema + unlock state for one game.
    async fn fetch_game(&self, creds: &AccountCredentials, game: &RemoteGameRef)
        -> Result<RemoteGameAchievements, ProviderError>;

    /// Optional: event-driven sources push changes instead of being polled.
    fn watch(&self, creds: &AccountCredentials, tx: UnlockSender) -> Option<WatchHandle> { None }
}
```

- Providers are **pure adapters**: they return normalized `Remote*` DTOs and know nothing about SQLite or notifications
- Errors are typed: `AuthExpired`, `RateLimited { retry_after }`, `Network`, `Unsupported`, `Parse`, `Other`. The sync engine maps these to backoff, re-auth prompts or UI status.
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

## 6. IPC contract (Tauri commands and events)

Generated to TypeScript via `tauri-specta`. Initial surface:

**Commands**
| Command | Description |
|---|---|
| `list_accounts()` | Accounts + status |
| `begin_connect(platform)` / `complete_connect(platform, payload)` | Auth flow |
| `disconnect_account(id)` | Remove account (option: keep data) |
| `list_games(filter, sort, page)` | Library query |
| `get_game(id)` | Game + platform entries |
| `list_achievements(platform_game_id, filter)` | |
| `list_activity(cursor, limit)` | Unlock timeline |
| `get_dashboard_stats()` | Aggregates |
| `sync_now(scope)` | Manual sync |
| `merge_games(ids)` / `split_game(id)` | Linking |
| `get_settings()` / `update_settings(patch)` | |
| `preview_notification(rarity)` | |
| `export_data(format)` | |

**Events (Rust to UI)**
`sync://status` (per-account progress/state), `achievement://unlocked`, `account://status-changed`, `settings://changed`.

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

- Secrets only via `keyring`; redact tokens in `tracing` output
- Tauri CSP locked down; allowlist only the IPC commands above; no remote content in the main window
- Auth webviews (OAuth) use separate, sandboxed windows and are destroyed after completion
- Auto-update packages signed; updater pubkey pinned in config
- Parse untrusted local files (trophy/stats binaries) defensively, with size limits and no panics

## 9. Testing strategy

| Layer | Approach |
|---|---|
| Domain / sync engine | Unit tests with an in-memory SQLite and a `FakeProvider` |
| Providers | Fixture-driven tests using `wiremock`; parsers fuzzed/property-tested for binary formats |
| IPC | Rust integration tests calling command handlers directly |
| Frontend | Vitest + React Testing Library for components; Playwright for key flows against a mocked IPC layer |
| Notifications | Manual preview harness + screenshot test of the toast component |
| CI | GitHub Actions: `cargo fmt/clippy/test`, `pnpm lint/typecheck/test`, Windows runner build |

## 10. Observability

- `tracing` with rolling log files in the app data dir; log level setting; "Open logs folder" in Settings
- Per-provider health surfaced in the Accounts screen (last success, last error)
