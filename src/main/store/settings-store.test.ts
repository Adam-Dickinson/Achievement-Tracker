import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations } from './migrate'
import { readProfileName, saveProfileName } from './settings-store'

describe('profile name setting', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    applyMigrations(db)
  })

  it('has no name until one is saved', () => {
    expect(readProfileName(db)).toBeNull()
  })

  it('saves a name, trimmed, and replaces it on the next save', () => {
    saveProfileName(db, '  Adam ')
    expect(readProfileName(db)).toBe('Adam')

    saveProfileName(db, 'Ada')
    expect(readProfileName(db)).toBe('Ada')
  })

  it('stores the name as JSON in the setting table', () => {
    saveProfileName(db, 'Adam')

    expect(db.prepare('SELECT key, value FROM setting').all()).toEqual([
      { key: 'profile.name', value: '"Adam"' },
    ])
  })

  it.each([
    ['null', null],
    ['an empty name', ''],
    ['only spaces', '   '],
  ])('forgets the name when saving %s', (_label, name) => {
    saveProfileName(db, 'Adam')

    saveProfileName(db, name)

    expect(readProfileName(db)).toBeNull()
    expect(db.prepare('SELECT COUNT(*) AS n FROM setting').get()).toEqual({ n: 0 })
  })

  it.each([
    ['not JSON', 'Adam'],
    ['not a string', '42'],
    ['an empty string', '""'],
  ])('ignores a stored value that is %s', (_label, value) => {
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run('profile.name', value)

    expect(readProfileName(db)).toBeNull()
  })
})
