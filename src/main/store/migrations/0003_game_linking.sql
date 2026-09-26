ALTER TABLE platform_game ADD COLUMN cover_url TEXT;
UPDATE platform_game
SET cover_url = (SELECT cover_url FROM game WHERE game.id = platform_game.game_id);
ALTER TABLE platform_game ADD COLUMN linked TEXT NOT NULL DEFAULT 'auto';
CREATE TABLE game_alias (
  match_key TEXT PRIMARY KEY,
  game_id   INTEGER NOT NULL REFERENCES game(id)
);
CREATE INDEX platform_game_game_id ON platform_game (game_id);
