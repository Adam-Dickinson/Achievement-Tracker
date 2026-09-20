-- Initial schema. Mirrors docs/SPEC.md §3. Forward-only: never edit once shipped.

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
