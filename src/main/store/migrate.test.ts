import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { applyMigrations, getSchemaVersion } from './migrate'
import { MIGRATIONS } from './migrations'

function tableNames(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String(row['name']))
}

describe('migrations', () => {
  it('are numbered sequentially from 1 and non-empty', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0)
    MIGRATIONS.forEach((migration, index) => {
      expect(migration.version).toBe(index + 1)
      expect(migration.name.startsWith(String(index + 1).padStart(4, '0') + '_')).toBe(true)
      expect(migration.sql.trim()).not.toBe('')
    })
  })

  it('create the schema when applied to an empty database', () => {
    const db = new DatabaseSync(':memory:')

    const version = applyMigrations(db)

    expect(version).toBe(MIGRATIONS.at(-1)?.version)
    for (const table of [
      'account',
      'game',
      'platform_game',
      'achievement',
      'unlock',
      'sync_state',
      'setting',
    ]) {
      expect(tableNames(db)).toContain(table)
    }
  })

  it('are a no-op when applied twice', () => {
    const db = new DatabaseSync(':memory:')
    const first = applyMigrations(db)

    expect(applyMigrations(db)).toBe(first)
    expect(getSchemaVersion(db)).toBe(first)
  })

  it('roll back a failing migration and keep the previous version', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db, [{ version: 1, name: '0001_ok', sql: 'CREATE TABLE a (id INTEGER)' }])

    expect(() =>
      applyMigrations(db, [
        { version: 1, name: '0001_ok', sql: 'CREATE TABLE a (id INTEGER)' },
        { version: 2, name: '0002_bad', sql: 'CREATE TABLE b (id INTEGER); THIS IS NOT SQL' },
      ]),
    ).toThrow()

    expect(getSchemaVersion(db)).toBe(1)
    expect(tableNames(db)).not.toContain('b')
  })
})
