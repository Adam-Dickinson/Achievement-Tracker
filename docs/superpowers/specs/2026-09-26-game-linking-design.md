# Cross-platform game linking: design

- **Date:** 2026-09-26
- **Roadmap:** M4, "Cross-platform game linking (auto-match + manual merge/split)"; SPEC F-32; DESIGN.md §8
- **Status:** approved in conversation; implementation by Claude (backend and React)

## Goal

A game you have on several platforms (or as several PlayStation trophy lists) shows as **one** Library entry with a tab per platform, as the M4 exit criterion asks. Linking happens automatically when titles match, and you can merge or unlink by hand; your manual choices stick.

Measured on the owner's library (568 platform games): 38 games link across platforms with the matching rule below, for example Apex Legends (Steam, EA, PlayStation), Destiny 2 (Steam, Epic, PlayStation) and God of War Ragnarök (Steam, PS4, PS5).

## Decisions (made with the owner)

| Question | Choice |
|---|---|
| How eager is auto-matching? | Link only when the **cleaned titles are equal**; no fuzzy matching. Misses are merged by hand |
| Same platform twice? | Yes when the cleaned titles are equal, which in practice means PlayStation lists (PS4 + PS5, PS3 + PS4). "Remastered" is part of the title, so remasters stay separate unless merged. One rule for every platform, not a PlayStation special case (approved) |
| What completion does a linked card show? | The **best platform**'s, plus a badge for every platform |
| Where are merge and unlink? | On **Game detail**: "Link another game…" (search) and "Unlink" per tab |
| Who builds it | Claude, backend and React |

Release year is not used (DESIGN.md §8 suggested it): no provider supplies it.

## Data

Approach: the existing canonical `game` table is the link. A linked game is several `platform_game` rows pointing at one `game`. (Rejected: a separate link table, which duplicates `game`; grouping at read time, which gives unstable ids and heavy queries.)

**Migration `0003_game_linking.sql`:**

```sql
ALTER TABLE platform_game ADD COLUMN cover_url TEXT;
UPDATE platform_game SET cover_url = (SELECT cover_url FROM game WHERE game.id = platform_game.game_id);
ALTER TABLE platform_game ADD COLUMN linked TEXT NOT NULL DEFAULT 'auto';
CREATE TABLE game_alias (
  match_key TEXT PRIMARY KEY,
  game_id   INTEGER NOT NULL REFERENCES game(id)
);
```

- `platform_game.cover_url`: each entry keeps its own cover (today one `game.cover_url` per platform game; it would collide once games share a `game`). `game.cover_url`, `game.title` and `game.sort_title` stay in the schema but are no longer read (SQLite cannot drop them cheaply); new rows still fill `title`/`sort_title` because they are `NOT NULL`.
- `platform_game.linked`: `auto` (auto-matching may move it) or `manual` (you merged or unlinked it; auto-matching never moves it).
- `game_alias`: the cleaned titles that lead to a game. A game made by auto-matching has its own cleaned title as an alias; a merge moves the merged game's aliases to the game it joined; a game made by "Unlink" has none, so nothing joins it automatically.

**Cleaned title, `matchKey(title)`** (pure, `src/main/store/match-key.ts`):

1. Unicode-normalise (NFKD) and drop accents; lower case.
2. Drop `®`, `™`, `©`; drop apostrophes (`'`, `’`) without a space (`assassin's` → `assassins`).
3. Drop a trailing platform tag the PlayStation parser adds: `(PS4)`, `(PS5 / PC)`, `(PS3 / PS Vita / PS4)`.
4. Drop edition words: `game of the year` / `goty` (with or without `edition`), and `edition` preceded by `digital deluxe`, `deluxe`, `standard`, `complete`, `definitive`, `ultimate`, `gold` or `anniversary`. (`enhanced` was dropped after the live run: on Steam, Little Nightmares and Metro Exodus have separate Enhanced Edition products with their own achievements, so it behaves like "Remastered".)
5. Turn every other run of non-letters/digits into one space; trim.

An empty result never matches (the entry keeps a game of its own).

**Grouping:**

- **When a sync adds a platform game** (`addPlatformGames`): compute its key; if an alias exists, join that game; otherwise create a game and an alias for the key. Updating an existing platform game updates its title, icon, cover and last played, never its group.
- **At startup** (`relinkGames(db)`, after migrations, idempotent): for every `auto` platform game, move it to the game its key's alias points at (creating game and alias when missing); then delete games with no platform games and their aliases. This groups existing libraries after the upgrade and applies any later change to the cleaning rules. `manual` platform games are never moved.
- **Merge** (`mergeGames(db, intoGameId, gameId)`): every platform game of `gameId` moves to `intoGameId` and becomes `manual`; so do those already in `intoGameId`; `gameId`'s aliases move to `intoGameId`; `gameId` is deleted. Merging a game into itself, or an unknown id, changes nothing and reports it.
- **Unlink** (`unlinkPlatformGame(db, platformGameId)`): the platform game moves to a new game with no alias and becomes `manual`; the rest of the group stays. Unlinking the only entry of a game changes nothing.

## What screens show

- **"Best" entry** of a game: the highest unlocked/total share; ties go to more unlocked, then the lower platform-game id; entries with no achievements come last.
- **Library card (one per game):** id is the **game** id; title is the **shortest** entry title (usually the one without ®/™ or a PlayStation tag); completion from the best entry; a badge per platform (`platforms`, each platform once, best first); cover from the best entry, else any entry that has one; sorted by the latest unlock across all entries, then title.
- **Game detail:** a combined summary (one progress line per entry) and a **tab per entry** with that entry's achievements, filters and rarest-first order as today. A tab is named after its platform; when two entries share a platform, the tab adds the entry's tag (the PlayStation parser's `(PS4)` suffix, else the entry title): "PlayStation · PS4". It opens on the best entry, or on the entry of the unlock you came from. **Link another game…** opens a search over your other Library games (filtered by title as you type); choosing one merges it into this game. **Unlink** appears on each tab when the game has more than one entry.
- **Dashboard:** "Games tracked" counts games; "Completed" means the best entry is at 100%; "Nearly there" ranks games by their best entry; achievement totals still add up every entry (the achievements differ per platform).
- **Activity and recent unlocks:** unchanged rows; opening one goes to its game on that unlock's tab.
- **Toasts and sync:** unchanged (per platform game).

## Contract changes (`src/shared`)

- `LibraryGame`: `id` becomes the game id; `platform: Platform` becomes `platforms: readonly Platform[]`; `unlocked`/`total` are the best entry's; `coverUrl`, `lastUnlockAt` as described above.
- `GameDetail`: `{ game: LibraryGame; entries: readonly GameEntry[] }` where `GameEntry` is `{ platformGameId, platform, tag: string | null, title, unlocked, total, achievements }`, best entry first.
- `RecentUnlock`: `gameId` becomes the game id; adds `platformGameId`.
- New IPC channels (sender and payload checked in `main/ipc.ts`; both answer nothing and fire `dataChanged` so open screens reload):
  - `mergeGames({ intoGameId, gameId })`: positive integers, not equal.
  - `unlinkGame({ platformGameId })`: a positive integer.

## Testing

- `match-key.test.ts`: every cleaning rule, real titles from the owner's library (®/™, apostrophes, PlayStation tags, GOTY and edition words, "Remastered" kept, empty keys).
- Store tests: grouping on insert (across platforms, PS4 + PS5, remasters apart); `relinkGames` (groups an existing library, idempotent, never moves `manual`, removes empty games); merge (aliases move, later entries with the merged title join, merging into itself); unlink (a new keyless game, later entries do not join it, the only entry); Library, Game detail, Dashboard and Activity queries on linked games (best entry, shortest title, cover fallback, tags, platform badges).
- Migration upgrade test (0002 → 0003 keeps covers).
- IPC tests for both channels (sender, bad payloads).
- Component tests: card badges; Game detail tabs, summary, opening tab, link search and unlink; Activity and Dashboard opening the right tab.
- Checked in the running app against the owner's library.

## Out of scope

Fuzzy suggestions, merging achievements across platforms, and a separate linking page.
