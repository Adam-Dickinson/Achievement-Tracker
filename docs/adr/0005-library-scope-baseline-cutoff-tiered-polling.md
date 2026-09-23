# ADR-0005: Library scope, a baseline cutoff for games found later, and tiered polling

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

The sync engine (SPEC §5) only synced games already in the database. Connecting a real Steam account made three problems concrete:

- **Finding games.** Something has to call `listGames` and add the games it returns. Steam's list is not complete: it includes games borrowed through Steam Families only while they are in the two-week recently-played window (docs/PROVIDERS.md), so a game can drop out of the list and must not be deleted when it does.
- **The baseline rule (F-16) was too blunt.** "A game's first sync emits no notifications" stops a flood of old unlocks when an account is connected. But a game found later, such as one just bought or borrowed and being played now, would also have its first unlocks swallowed.
- **Steam's request budget.** Syncing every game every 5 minutes costs 3 requests per game: about 148,000 a day for the owner's 171 games, against Valve's limit of 100,000 per key.

## Options considered

**Baseline for games found later**

| Option | Result |
|---|---|
| Keep every first sync silent (status quo) | First unlocks in a new or borrowed game never toast |
| Toast everything on a found game's first sync | A game found late (for example after a week offline) toasts its whole history |
| **Toast only unlocks dated after the previous library look** | Anything unlocked since the app last could have seen the game toasts; older history stays silent; nothing toasts on the account's first look |
| Toast only unlocks after the moment the game was found | Misses unlocks made between launching the game and the next library look, which is the case we care about |

**Polling budget**

| Option | Result |
|---|---|
| Longer interval for every game | Slower toasts for the game actually being played |
| **Tiers: recently played every interval, the rest every 6 hours** | Toast latency unchanged for games being played; about 12,000 requests a day for 171 games with 11 recent |
| Running-game detection only (F-12) | The right long-term signal, but it is M2 work and needs process detection |

## Decision

- **Library scope.** Each account round starts with a `library` scope: `listGames`, then `addPlatformGames` inside one transaction. It runs on the normal interval, with the same backoff and re-login handling as game scopes. It only adds and updates rows and never deletes one (SPEC §5).
- **Baseline cutoff (changes F-16).** New `platform_game.baseline_cutoff` (migration `0002`). A game added by a library look gets that look's predecessor's `last_ok_at` as its cutoff; on the account's first look it is `NULL`. A game's first sync announces only unlocks dated **after** its cutoff. Undated unlocks, and every unlock when the cutoff is `NULL`, are recorded silently. Later syncs announce every new unlock, as before.
- **Tiered polling.** `RemoteGame.recentlyPlayed` says whether the platform counts a game as played lately (Steam: it is in `GetRecentlyPlayedGames`). Recent games sync every `SYNC_INTERVAL_MS` (5 min); the others sync at most every `IDLE_INTERVAL_MS` (6 h) after their last success. Until the library has been read in this session, every game counts as recent, so a failing library read can't make the app miss an unlock.

## Consequences

**Positive:**

- New and borrowed games toast from their first sync.
- Connecting an account still produces no flood.
- Steam stays well inside its budget; a test simulates a day with 171 games.
- Games dropping out of `listGames` keep syncing.

**Negative / to accept:**

- An idle game that starts being played is only polled quickly once it shows up as recent. How soon Steam adds a game to `GetRecentlyPlayedGames` is unverified (PROVIDERS.md), so the first toast in such a game can be late, though never lost. Running-game detection (F-12, M2) removes this.
- If the app was closed for a while, a newly found game toasts the unlocks since the last library look, the same way known games do.
- The set of recent games is kept in memory and rebuilt by the first library read after a restart.

## Revisit if

- Running-game detection lands: it becomes the main signal for the fast tier.
- Another platform's budget or "recent" signal doesn't fit this two-tier model.
