import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_SETTINGS } from '@shared/ipc'
import { applyMigrations } from './migrate'
import {
  readNotificationSettings,
  readProfileName,
  saveProfileName,
  updateNotificationSettings,
} from './settings-store'

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

describe('notification settings', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    applyMigrations(db)
  })

  it('starts at the defaults until something is saved', () => {
    expect(readNotificationSettings(db)).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
  })

  it('merges a patch into the current settings and persists it', () => {
    updateNotificationSettings(db, { corner: 'top-left', durationSec: 8 })

    expect(readNotificationSettings(db)).toEqual({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      corner: 'top-left',
      durationSec: 8,
    })
  })

  it('merges a platform patch without dropping the other platforms', () => {
    updateNotificationSettings(db, { enabledPlatforms: { xbox: false } })

    const settings = readNotificationSettings(db)
    expect(settings.enabledPlatforms.xbox).toBe(false)
    expect(settings.enabledPlatforms.steam).toBe(true)
  })

  it('merges a sound patch without dropping the volume', () => {
    updateNotificationSettings(db, { sound: { enabled: false } })

    expect(readNotificationSettings(db).sound).toEqual({ enabled: false, volume: 0.6 })
  })

  it('keeps the latest settings across separate updates', () => {
    updateNotificationSettings(db, { corner: 'top-left' })
    updateNotificationSettings(db, { size: 'large' })

    expect(readNotificationSettings(db)).toMatchObject({ corner: 'top-left', size: 'large' })
  })

  it('falls back to the defaults when the stored value is not valid settings', () => {
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run(
      'notifications.settings',
      JSON.stringify({ corner: 'somewhere' }),
    )

    expect(readNotificationSettings(db)).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
  })

  it('keeps saved settings from before a platform existed, turning the new platform on', () => {
    const olderPlatforms = Object.fromEntries(
      Object.entries({ ...DEFAULT_NOTIFICATION_SETTINGS.enabledPlatforms, xbox: false }).filter(
        ([platform]) => platform !== 'shadps4',
      ),
    )
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run(
      'notifications.settings',
      JSON.stringify({
        ...DEFAULT_NOTIFICATION_SETTINGS,
        corner: 'top-left',
        enabledPlatforms: olderPlatforms,
      }),
    )

    const settings = readNotificationSettings(db)

    expect(settings.corner).toBe('top-left')
    expect(settings.enabledPlatforms).toMatchObject({ xbox: false, shadps4: true })
  })

  it('falls back to the defaults when the stored value is not JSON', () => {
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run(
      'notifications.settings',
      'not json',
    )

    expect(readNotificationSettings(db)).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
  })
})
