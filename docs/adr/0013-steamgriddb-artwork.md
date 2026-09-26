# ADR-0013: Missing artwork comes from SteamGridDB, with the user's own API key

- **Status:** Accepted
- **Date:** 2026-09-26

## Context

M4 asks for an image on every Library card. After cross-platform linking (a game borrows a linked copy's cover) and the generated Afterglow cover, a few games still had no real art: games whose platform has none (Epic catalog entries that are empty, delisted games such as Football Manager 2024 and the original Death Stranding, Steam apps that are no longer store products).

Spikes (see [PROVIDERS.md](../PROVIDERS.md)): Epic's store search by namespace and Steam's public store search by title each fixed only one of them. Steam's current app list leaves delisted games out and its old full list is gone, so a title cannot be mapped to a delisted app's still-existing images. SteamGridDB, a community artwork database used by tools such as Playnite and Achievement Watcher Next, had art for 4 of the owner's 5 games, including the delisted ones, and its search returns the right game first when titles are compared exactly.

SteamGridDB's API needs an API key. Achievement Watcher Next ships one shared key in its source. This project stores no shared secrets and keeps every credential in the `SecretStore` (rule 3).

## Options considered

| Option | For | Against |
|---|---|---|
| **SteamGridDB with the user's own free key, optional** | Near-complete coverage; the key is the user's, stored encrypted like the Steam key; nothing is sent without it | One more thing to set up; users without a key keep generated covers |
| SteamGridDB with one key built into the app | Nothing to set up | The key is public in a GPL repository, shared and rate-limited across every user, and can be revoked at any time |
| IGDB (Twitch) | Also maps names to store ids | Each user must create a Twitch developer app (client id and secret) |
| Scraping SteamDB, as Achievement Watcher Next does | Finds delisted Steam apps | SteamDB forbids automated scraping |
| Generated covers only | Nothing new | Real art is available for most of these games |

## Decision

**Missing artwork comes from SteamGridDB, only when the user has added their own SteamGridDB API key in Settings → Artwork.** The owner chose this on 2026-09-26.

- The key is checked with one request before it is saved, then stored in the `SecretStore` under `steamgriddb`. It is only ever sent to `www.steamgriddb.com`.
- An artwork service in the main process (`src/main/artwork/`, not a provider: it enriches games, it does not read achievements) looks up games that have no art from their platforms or a linked copy, one at a time, at startup, after syncs find games, when a key is saved, and from "Find missing artwork now".
- A result is used only when its cleaned title equals the game's (the linking rule, `matchKey`), so a near miss ("Georgie-Yolkie" for "yorkie Production") is never shown. The image is the thumbnail (419x196 JPEG) of the best landscape grid: most votes, then the "alternate" style, then 920x430; NSFW, humour and flashing images are excluded.
- Results, including "nothing found", are stored by cleaned title in an `artwork` table, so they survive linking and unlinking; "nothing found" is asked again after 30 days. A refused key or an unreachable service stops the run and is shown on the Artwork card.

## Consequences

**Positive:**

- Every game SteamGridDB knows gets real art, delisted ones included, with no shared secret in the app.
- Without a key nothing changes: games keep their generated cover and no request is made.

**Negative / to accept:**

- A third-party, community-run service is added, with community-uploaded images; the Artwork card says so.
- Users must create a SteamGridDB account and key to benefit.
- Exact title matching misses games whose name differs between platform and SteamGridDB (for example Epic codenames); they keep a generated cover.

## Revisit if

- SteamGridDB changes its API, terms or key rules (for example allowing or forbidding app-embedded keys).
- A keyless source appears that maps titles, including delisted games, to artwork.
