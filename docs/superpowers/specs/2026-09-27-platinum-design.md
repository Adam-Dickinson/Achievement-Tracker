# A platinum for every game: design

- **Date:** 2026-09-27
- **Roadmap:** M5 (new item, "Platinums"); SPEC F-35 (new)
- **Status:** approved in conversation; backend and tests by Claude, React by the owner

## Goal

PlayStation games end in a platinum trophy; other platforms don't. Give every game one:

1. A game's **own** "unlock everything" achievement (Elden Ring's "Elden Ring", "Obtained all achievements") is treated as its platinum.
2. A game **without** one earns an **app-awarded Platinum** when you reach 100%.

Measured on the owner's library: 40 Steam and Xbox entries have their own platinum (rule below), 90 of 100 PlayStation lists have a real one, and 15 entries are already at 100% (14 Steam, 1 PlayStation).

## Decisions (made with the owner)

| Question | Choice |
|---|---|
| Which kind? | **Both**: mark a game's own "unlock everything" achievement, and award one to games without it |
| How does the app-awarded Platinum show? | **As a trophy outside the totals**: its own tile at the top of Game detail, a platinum toast, a line in Activity and a "Platinums" count on the Dashboard. It never counts in achievement totals or completion %, so the numbers still match the platforms |
| Where is the app-awarded Platinum kept? | **Its own table** (rejected: a synthetic achievement row, which every count query would have to leave out; working it out on the fly, which gives no fixed date, repeats the toast and loses the platinum when DLC adds achievements) |
| Per game or per platform? | **Per platform entry**, like PlayStation: Elden Ring on Steam and on Xbox each have their own |
| Who builds it | Claude: detection, migration, sync, toast data, IPC data and all tests. The owner: the screens (Game detail tile and styling, Activity line, Dashboard count, the toast's platinum look) |

## 1. A game's own platinum (detected, not stored)

`isPlatinumAchievement(achievement, gameTitle)` (pure, `src/main/store/platinum.ts`, beside `match-key.ts` so both the store and the sync pass can use it) is true when:

- the platform says so (`tier === 'platinum'`, PlayStation today), or
- the achievement has no tier and its description (at most 90 characters) says "unlock everything":
  1. Split the description and the game title into words: drop `®`, `™`, `©` first (Unicode normalisation turns `™` into `TM`), then NFKD, drop accents, lower case, keep runs of letters, digits and apostrophes.
  2. Find `all` or `every`, then up to four words, then `achievement(s)`, `trophy` or `trophies`.
  3. Every word in between is filler (`the`, `other`, `of`, `your`, `base`, `main`, `game`, `regular`, `story`, `remaining`) or a word of the game's own title ("all *Horizon Zero Dawn* achievements").
  4. The word after it, if any, is one of `in`, `for`, `of`, `and`, `from`, `obtained`, `completed`, `have`, `unlocked`, `earned`, `collected` ("every trophy **in** Days Gone" yes, "every trophy **animal** species" no).

It is applied wherever achievements are read or synced, so nothing is stored and a change to the rule applies at once.

**Checked on the owner's library:** 40 entries, one each, all genuine, including Elden Ring, Sekiro, the Dark Souls games, God of War, The Last of Us Part I and II ("all the regular story achievements"), Ghost of Tsushima ("all base game achievements"), both Horizon games, Death Stranding, and Wuchang and Lords of the Fallen on both Steam and Xbox. Correctly left out: theHunter's "every trophy animal species" (twice), "Collect all Batcave Trophies", "Collect all sea monster trophies", "Complete all Spirits of Amazonia achievements", Counter-Strike: Source's "Unlock all 6 Pistol kill achievements" and similar, and Skillshot City's long "Like all achievements this can't be completed in the warmup round". Rarity was tried as a second check and dropped: DLC achievements rarer than the platinum made it reject Ghost of Tsushima and Horizon Forbidden West, and Ubisoft reports no rarity at all.

## 2. The app-awarded Platinum (stored)

**Migration `0006_platinum.sql`:**

```sql
CREATE TABLE platinum (
  platform_game_id INTEGER PRIMARY KEY REFERENCES platform_game(id),
  earned_at        TEXT,           -- the entry's latest unlock time (null if none is dated)
  detected_at      TEXT NOT NULL   -- when the app awarded it
);
```

**Who earns one:** a platform entry with at least one achievement, every achievement unlocked, and none that `isPlatinumAchievement` accepts. (A PlayStation list without a platinum trophy, such as a small game, earns one too.)

**When** (all in `src/main/store/platinum.ts`, SQL in the store as rule 8 says):

- **During a sync pass**, inside its transaction, after the new unlocks are stored: `awardPlatinum(db, platformGameId)` adds the row if the entry qualifies and has none. The pass **announces** it only if the same pass announced at least one unlock. So a first sync (the baseline rule, F-16), or a game that reaches 100% because the platform removed an achievement, awards it silently.
- **At startup**, after `relinkGames`: `awardPlatinums(db)` awards every entry that already qualifies, silently. This covers the upgrade (the 15 games already at 100%) and is idempotent.
- **Kept for good:** if DLC later adds achievements, the row stays (like a PlayStation platinum). If the entry later turns out to have its own platinum (a rule change), the screens show that one and ignore the row.
- **Disconnect with "remove games"** deletes the account's rows before its platform games (`deleteAccountData`). Linking, merging and unlinking don't touch it: it belongs to a platform entry, not a game.

## 3. Toasts

- `ToastPayload` gains `platinum: boolean`, so the overlay can give platinums their own look (owner's UI work).
- An own platinum (an achievement that `isPlatinumAchievement` accepts) is an ordinary unlock with heading **"Platinum unlocked"** and `platinum: true`.
- An app-awarded Platinum comes from the sync pass as an `UnlockEvent` whose achievement is a stand-in (`externalId: 'trophy-locker:platinum'`, name **"Platinum"**, description "Every achievement in <game>", tier `platinum`, no rarity), with heading **"Platinum earned"** and `platinum: true`. The notification service's duplicate key already covers it (platform, game, `externalId`).
- **Never collapsed:** when more than five unlocks arrive at once, the others still collapse into one burst toast, but a platinum is always shown on its own, after them.

## 4. What the screens get (shared types and IPC)

- `GameAchievement` and `UnlockedAchievement` gain `platinum: boolean` (from `isPlatinumAchievement`, so PlayStation's platinum is marked too; today no tier reaches the UI).
- `GameEntry` gains `appPlatinum: { earnedAt: Date | null } | null`: set when the entry has a row and no own platinum.
- Activity: `ActivityPage.unlocks` becomes a list of `ActivityItem = RecentUnlock | RecentPlatinum`. `RecentUnlock` gains `kind: 'achievement'`, and `RecentPlatinum` is `{ kind: 'platinum', gameId, platformGameId, gameTitle, platform, unlockedAt }`, for app-awarded platinums with a date. Both are sorted together, newest first, within the same limit.
- `DashboardStats` gains `platinums: number`: platform entries with an unlocked own platinum plus entries with an app-awarded one, each entry counted once.
- The Library card is unchanged (not asked for).

## 5. Tests (Claude)

- `platinum.test.ts`: the rule on the real descriptions above (all 40 accepted; every left-out example rejected), `™` in titles, accents, the 90-character limit, the platform tier; awarding (qualifies, already has one, own platinum, empty game, not complete, undated unlocks), the startup pass and its idempotence, keeping the row after DLC.
- `migrate.test.ts`: the 0006 upgrade on a database with data.
- `sync-pass.test.ts`: awarded and announced on the unlock that completes a game; silent on a first sync and when completion comes from a removed achievement; not awarded when the game has its own platinum; the stand-in event's fields.
- `notifications.test.ts`: headings and `platinum` for both kinds; a platinum kept out of a burst and shown after it.
- `library-store.test.ts`: `platinum` on achievements and unlocks, `appPlatinum` on entries (hidden when an own platinum exists), platinums in Activity in date order and within the limit, the Dashboard count, and `deleteAccountData` removing the rows.
- Renderer tests for the owner's UI once it exists (the tile, the Activity line, the count, the toast), as usual.

## Docs to update when built

SPEC (F-35, the `platinum` table in the schema, the types), ARCHITECTURE (awarding in the sync pass), PROJECT-MAP (new files), ROADMAP (M5 item), CLAUDE.md status.
