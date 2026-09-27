import type { DatabaseSync } from 'node:sqlite'

const PROFILE_NAME = 'profile.name'

export function readProfileName(db: DatabaseSync): string | null {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(PROFILE_NAME) as
    { value: string } | undefined
  if (!row) return null
  try {
    const value: unknown = JSON.parse(row.value)
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  } catch {
    return null
  }
}

export function saveProfileName(db: DatabaseSync, name: string | null): void {
  const trimmed = name?.trim() ?? ''
  if (trimmed === '') {
    db.prepare('DELETE FROM setting WHERE key = ?').run(PROFILE_NAME)
    return
  }
  db.prepare(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(PROFILE_NAME, JSON.stringify(trimmed))
}
