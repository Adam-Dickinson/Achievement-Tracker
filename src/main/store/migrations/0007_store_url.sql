ALTER TABLE platform_game ADD COLUMN store_url TEXT;

UPDATE platform_game
SET store_url = 'steam://nav/games/details/' || external_id
WHERE platform = 'steam' AND external_id GLOB '[0-9]*' AND external_id NOT GLOB '*[^0-9]*';
