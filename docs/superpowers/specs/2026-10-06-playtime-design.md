# Playtime per game: design

## Goal

Show how long the user has played each game, using the figures the platforms already report. Playtime appears in the Library (a sort and a label on each row or card) and on Game detail. It does not appear on the Dashboard.

## Scope

In this pass:

- Steam, Epic and EA report playtime.
- Library: a "Most played" sort and a compact playtime label on each row and card.
- Game detail: a total "Played" stat plus a per-platform line for each entry that reports playtime.
- Data export includes playtime per entry.

Out of this pass:

- Ubisoft, Xbox, PlayStation, shadPS4 and RPCS3 return no playtime until a source is verified (rule 10). They are a separate pass.
- Tracking play sessions ourselves through the launch module (ADR-0017). Possible later, and it needs its own design because of rule 4.
- A Dashboard stat or "most played" list.
- Playtime history (per-day deltas, graphs).
- Announcements. A playtime change never raises a toast and does not touch the baseline rule (F-16, ADR-0005).

## Decisions

| Question | Decision |
| --- | --- |
| Source | Platform-reported only |
| Where shown | Library and Game detail, not the Dashboard |
| Providers | Steam, Epic and EA now; the rest in a later pass |
| Linked games | Sum across linked entries, with a partial marker when some linked entry has no data |

## Data path

- `src/shared/models.ts`: `RemoteGame` gains `playtimeSeconds: number | null`. `null` means the platform does not report playtime. `0` means it reports none played.
- Migration `0009_playtime.sql` adds a nullable `playtime_seconds INTEGER` column to `platform_game`, with an upgrade test (rule 8).
- `src/main/store/sync-store.ts` upserts it with `COALESCE(?, playtime_seconds)`, the same way as `last_played`, so a `null` from a failed or empty fetch never wipes a stored value.
- Providers stay pure adapters (rule 1):
  - Steam: the playtime field in replies already parsed, added to the zod schema (ADR-0004). The family-library path uses `rt_playtime` from `GetSharedLibraryApps`.
  - Epic: the playtime map the provider already fetches, mapped through each game's records. Several records can belong to one game, so their values are summed.
  - EA: `totalPlayTimeSeconds` from the `recentGames` query the provider already sends.
  - Ubisoft: `null`. Its games query has no playtime field and none is documented.
  - Xbox, PlayStation, shadPS4, RPCS3: `null`.

### Verify before coding

Per rule 10, capture a real reply for each source before writing its parser, and record what was found in PROVIDERS.md:

- Steam owned games (`GetOwnedGames` playtime) and family library (`rt_playtime`).
- Epic playtime and EA `totalPlayTimeSeconds` are already documented in PROVIDERS.md; confirm they still match.

If a documented field is missing or differently shaped, report it and drop that source for this pass rather than guessing.

## Sum and presentation

- `src/shared/ipc.ts`: the game summary and the per-platform entry each gain `playtimeSeconds: number | null`. The summary also gains `playtimePartial: boolean`.
- `src/main/store/library-store.ts` computes the summary value where it already merges linked entries:
  - the sum of the non-null entry values;
  - `null` when every entry is `null`;
  - `playtimePartial` is true when at least one entry is `null` while another has a value;
  - values are not deduplicated across platforms, since each platform holds its own time.
- Library: a `playtime` entry in the `SORTS` table in `library-view.ts`, most played first, `null` last, ties broken by title. The sort stays in the renderer (ADR-0014). Rows and cards show "42h", or "42h+" when partial, and nothing when `null`. The label has accessible text such as "42 hours played, may be incomplete".
- Game detail: a "Played" stat with the total (with the partial marker), and a per-platform line for each entry that reports playtime.
- Formatting: one shared helper turns seconds into text. Under an hour it shows minutes ("35m"), above that whole hours ("42h", "1,203h"). It uses the existing locale helpers, because CI runs en-US while local is en-ZA.
- Data export (`src/shared/data-export.ts`, `export-store.ts`): playtime per entry.

## Testing

- Provider parse tests with sanitized fixtures for Steam, Epic and EA (rule 7).
- Migration upgrade test.
- Sync-store tests: playtime is stored, updates, and a `null` does not wipe a stored value.
- Library-store tests: sum, all-null, partial.
- Unit tests for the `playtime` sort (null last, tie-break) and the format helper (minutes, hours, thousands separator, locale).
- Component tests: Library label (including "+" and accessible text), Game detail total and per-platform lines.
- Pure styling needs no test.

## Docs to update

PROVIDERS.md (only what was verified), PROJECT-MAP.md, SPEC.md (schema and IPC contract), ROADMAP.md, and the status counts in CLAUDE.md after the change lands.

## Risks

- Each platform defines playtime its own way, and the figure may not match what the user remembers. The UI shows platform-reported time and does not claim it is exact.
- With only three providers reporting, partial totals on linked games will be common. The "+" marker is the mitigation.
