import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from './migrate'

export function openDatabase(path: string): { db: DatabaseSync; schemaVersion: number } {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  return { db, schemaVersion: applyMigrations(db) }
}
