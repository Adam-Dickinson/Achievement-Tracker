import { MIGRATIONS, type Migration } from './migrations'

/** The small slice of a SQLite driver we need. `node:sqlite`'s DatabaseSync satisfies it. */
export interface SqlDatabase {
  exec(sql: string): void
  prepare(sql: string): { get(): unknown }
}

export function getSchemaVersion(db: SqlDatabase): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

/**
 * Applies every migration newer than the database's version and returns the new version.
 * Progress is tracked in SQLite's `user_version` pragma; each migration runs in its own
 * transaction, so a failure leaves the database at the last good version.
 */
export function applyMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): number {
  const current = getSchemaVersion(db)

  for (const migration of migrations.filter((m) => m.version > current)) {
    db.exec('BEGIN')
    try {
      db.exec(migration.sql)
      db.exec(`PRAGMA user_version = ${migration.version}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  return getSchemaVersion(db)
}
