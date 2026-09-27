CREATE TABLE platinum (
  platform_game_id INTEGER PRIMARY KEY REFERENCES platform_game(id),
  earned_at        TEXT,
  detected_at      TEXT NOT NULL
);
