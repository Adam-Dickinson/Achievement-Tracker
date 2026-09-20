---
name: db-migration
description: Use for any SQLite schema change in Achievement Tracker: adding tables/columns/indexes, or changing constraints. Ensures forward-only migrations, updated queries, and tests.
---

# Change the database schema

## Rules
- Migrations live in `crates/store/migrations/NNNN_description.sql` and are **forward-only**. Never edit a migration that has shipped or been applied. Add a new one.
- SQL exists only in `crates/store`. No SQL elsewhere.
- Users have real data. Every migration must preserve it (use copy-and-swap for column changes SQLite can't `ALTER`).

## Steps
1. Create the next numbered file (zero-padded, sequential). One logical change per file.
2. Write idempotent-safe DDL (`CREATE TABLE IF NOT EXISTS` only where appropriate). Add indexes for new query paths.
3. For data transforms, do them in the same migration inside the transaction.
4. Update `crates/store/src/*.rs` queries and types. If using `sqlx` compile-time checks, refresh the offline query data (`cargo sqlx prepare --workspace`) and commit it.
5. Update `docs/SPEC.md` §3 schema so docs match reality.
6. Tests:
   - Migrate an empty DB to head.
   - Migrate a DB seeded at the previous version (with representative rows) to head and assert data survived.
7. If IPC-visible types changed, regenerate `bindings.ts`.

## Checklist
- [ ] New migration file, none edited
- [ ] Queries + types updated
- [ ] SPEC schema updated
- [ ] Upgrade-with-data test passes
- [ ] `cargo test -p store` green
