import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from './migrate'

/**
 * Opens (creating if needed) the app database, applies pending migrations and returns it.
 * SQL lives only under `src/main/store` (docs/ARCHITECTURE.md §2).
 *
 * Uses Node's built-in `node:sqlite`, so there is no native module to rebuild for Electron.
 * It is still marked experimental in Node: the rest of the app only depends on the small
 * `SqlDatabase` interface in `migrate.ts`, so swapping the driver later is a contained change.
 */
export function openDatabase(path: string): { db: DatabaseSync; schemaVersion: number } {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  return { db, schemaVersion: applyMigrations(db) }
}
