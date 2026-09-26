UPDATE platform_game
SET cover_url = NULL
WHERE platform = 'steam'
  AND cover_url LIKE 'https://cdn.akamai.steamstatic.com/steam/apps/%/header.jpg';
