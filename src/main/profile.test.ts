import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { getProfile, windowsUserName } from './profile'
import { applyMigrations } from './store/migrate'
import { saveProfileName } from './store/settings-store'

describe('windowsUserName', () => {
  it('reads the signed-in user, trimmed', () => {
    expect(windowsUserName(() => '  adam ')).toBe('adam')
  })

  it('is empty when the system cannot say who is signed in', () => {
    expect(
      windowsUserName(() => {
        throw new Error('no passwd entry')
      }),
    ).toBe('')
  })
})

describe('getProfile', () => {
  it('reports the saved name beside the Windows name', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)

    expect(getProfile(db, 'adamg')).toEqual({ name: null, windowsName: 'adamg' })

    saveProfileName(db, 'Adam')

    expect(getProfile(db, 'adamg')).toEqual({ name: 'Adam', windowsName: 'adamg' })
  })
})
