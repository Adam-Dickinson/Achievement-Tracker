-- A game's first sync emits events only for unlocks dated after this time (ISO-8601 UTC).
-- NULL keeps the first sync fully silent: games found when an account is first connected.
ALTER TABLE platform_game ADD COLUMN baseline_cutoff TEXT;
