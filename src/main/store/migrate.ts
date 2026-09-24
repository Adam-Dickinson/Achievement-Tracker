import { MIGRATIONS, type Migration } from './migrations'

export interface SqlDatabase {
  exec(sql: string): void
  prepare(sql: string): { get(): unknown }
}

export function getSchemaVersion(db: SqlDatabase): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

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
