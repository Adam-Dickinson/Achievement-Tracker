---
name: db-migration
description: Use for any SQLite schema change in Achievement Tracker: adding tables/columns/indexes, or changing constraints. Ensures forward-only migrations, updated queries, and tests.
---

# Change the database schema

## Rules
- Migrations live in `src/AchievementTracker.Store/Migrations/NNNN_description.sql` (embedded resources, picked up automatically by `Migrations.All`) and are **forward-only**. Never edit a migration that has shipped or been applied. Add a new one.
- SQL exists only in `AchievementTracker.Store`. No SQL elsewhere.
- Users have real data. Every migration must preserve it (use create-copy-drop-rename for column changes SQLite can't `ALTER`).
- The applied version is tracked in SQLite's `PRAGMA user_version`; `MigrationRunner.Apply` runs each pending migration in its own transaction.

## Steps
1. Create the next numbered file (zero-padded four digits, sequential from `0001`). One logical change per file.
2. Write the DDL. Add indexes for new query paths.
3. For data transforms, do them in the same migration (it's transactional).
4. Update the queries and types in `AchievementTracker.Store`.
5. Update `docs/SPEC.md` §3 schema so docs match reality.
6. Tests (`tests/AchievementTracker.Tests/MigrationTests.cs`):
   - The existing tests check numbering and that an empty database migrates to head. Add the new tables/columns to the assertions.
   - Add an upgrade test: create a database at the previous version (apply migrations up to N-1, insert representative rows), apply the new migration, and assert the data survived.

## Checklist
- [ ] New migration file, none edited
- [ ] Queries + types updated
- [ ] SPEC schema updated
- [ ] Upgrade-with-data test passes
- [ ] `dotnet build` (no warnings) and `dotnet test` green
