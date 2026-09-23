import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations } from './migrate'
import {
  getAccount,
  getPlatformGameByExternalId,
  getSyncState,
  insertNewUnlocks,
  setAccountStatus,
  setBaselineDone,
  upsertAchievements,
  upsertSyncState,
} from './sync-store'

// Seeds a database with the rows every test below builds on: one account, one canonical game,
// one platform_game (baseline not yet done). Real schema, via the real migrations -- not a
// hand-rolled table -- so these tests fail if a migration and this file ever drift apart.
function seedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  db.exec(`
    INSERT INTO account (id, platform, external_id, display_name, status, created_at)
    VALUES (1, 'steam', 'acc1', 'Test Account', 'connected', '2026-01-01')
  `)
  db.exec(`INSERT INTO game (id, title, sort_title) VALUES (1, 'A Game', 'a game')`)
  db.exec(`
    INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title, baseline_done)
    VALUES (1, 1, 1, 'steam', 'g1', 'A Game', 0)
  `)
  return db
}

describe('getPlatformGameByExternalId', () => {
  let db: DatabaseSync
  beforeEach(() => {
    db = seedDb()
  })

  it('reads the row, including its title, and converts baseline_done to a real boolean', () => {
    expect(getPlatformGameByExternalId(db, 1, 'g1')).toEqual({
      id: 1,
      title: 'A Game',
      baselineDone: false,
    })
  })

  it('throws for a game that does not exist, rather than returning null', () => {
    expect(() => getPlatformGameByExternalId(db, 1, 'does-not-exist')).toThrow()
  })
})

describe('upsertAchievements', () => {
  let db: DatabaseSync
  beforeEach(() => {
    db = seedDb()
  })

  const achievement = {
    externalId: 'ach1',
    name: 'First',
    description: null,
    iconUrl: null,
    iconLockedUrl: null,
    hidden: false,
    points: 10,
    tier: null,
    globalPercent: 5.5,
  }

  it('inserts a new achievement', () => {
    upsertAchievements(db, 1, [achievement])

    const rows = db.prepare('SELECT * FROM achievement').all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.['name']).toBe('First')
    expect(rows[0]?.['hidden']).toBe(0)
  })

  it('updates the existing row on a second call for the same achievement, not a duplicate', () => {
    upsertAchievements(db, 1, [achievement])
    upsertAchievements(db, 1, [{ ...achievement, name: 'Updated', hidden: true }])

    const rows = db.prepare('SELECT * FROM achievement').all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.['name']).toBe('Updated')
    expect(rows[0]?.['hidden']).toBe(1)
  })
})

describe('insertNewUnlocks', () => {
  let db: DatabaseSync
  beforeEach(() => {
    db = seedDb()
    upsertAchievements(db, 1, [
      {
        externalId: 'ach1',
        name: 'First',
        description: null,
        iconUrl: null,
        iconLockedUrl: null,
        hidden: false,
        points: null,
        tier: null,
        globalPercent: null,
      },
    ])
  })

  it('inserts a genuinely new unlock and reports it as new', () => {
    const unlockedAt = new Date('2026-01-05T00:00:00.000Z')
    const newOnes = insertNewUnlocks(db, 1, [
      { achievementExternalId: 'ach1', unlockedAt, progress: { current: 3, max: 5 } },
    ])

    expect(newOnes).toHaveLength(1)
    const rows = db.prepare('SELECT * FROM unlock').all() as Record<string, unknown>[]
    expect(rows[0]?.['unlocked_at']).toBe(unlockedAt.toISOString())
    expect(rows[0]?.['progress_cur']).toBe(3)
    expect(rows[0]?.['progress_max']).toBe(5)
  })

  it('does not report an already-recorded unlock as new on a later sync pass', () => {
    const unlock = { achievementExternalId: 'ach1', unlockedAt: new Date(), progress: null }

    const firstPass = insertNewUnlocks(db, 1, [unlock])
    const secondPass = insertNewUnlocks(db, 1, [unlock]) // same provider data next time

    expect(firstPass).toHaveLength(1)
    expect(secondPass).toHaveLength(0)
    expect(db.prepare('SELECT * FROM unlock').all()).toHaveLength(1) // still one row
  })

  it('throws rather than silently dropping an unlock for an unknown achievement', () => {
    expect(() =>
      insertNewUnlocks(db, 1, [
        { achievementExternalId: 'does-not-exist', unlockedAt: null, progress: null },
      ]),
    ).toThrow()
  })
})

describe('setBaselineDone', () => {
  it('flips baseline_done for the given game only, leaving others untouched', () => {
    const db = seedDb()
    db.exec(`INSERT INTO game (id, title, sort_title) VALUES (2, 'B', 'b')`)
    db.exec(`
      INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title, baseline_done)
      VALUES (2, 2, 1, 'steam', 'g2', 'B', 0)
    `)

    setBaselineDone(db, 1)

    expect(getPlatformGameByExternalId(db, 1, 'g1').baselineDone).toBe(true)
    expect(getPlatformGameByExternalId(db, 1, 'g2').baselineDone).toBe(false)
  })
})

describe('getSyncState / upsertSyncState', () => {
  let db: DatabaseSync
  beforeEach(() => {
    db = seedDb()
  })

  it('returns null for a scope that has never synced', () => {
    expect(getSyncState(db, 1, 'game:g1')).toBeNull()
  })

  it('round-trips dates through upsert then get', () => {
    const nextDueAt = new Date('2026-02-01T00:00:00.000Z')
    upsertSyncState(db, 1, 'game:g1', {
      cursor: null,
      lastOkAt: null,
      lastError: null,
      nextDueAt,
    })

    const state = getSyncState(db, 1, 'game:g1')
    expect(state?.nextDueAt).toEqual(nextDueAt)
    expect(state?.lastOkAt).toBeNull()
  })

  it('updates the existing row for the same (account, scope), including clearing last_error', () => {
    upsertSyncState(db, 1, 'game:g1', {
      cursor: null,
      lastOkAt: null,
      lastError: 'first failure',
      nextDueAt: new Date('2026-01-05T00:00:00.000Z'),
    })
    const lastOkAt = new Date('2026-01-06T00:00:00.000Z')
    upsertSyncState(db, 1, 'game:g1', {
      cursor: null,
      lastOkAt,
      lastError: null, // success clears the previous error
      nextDueAt: new Date('2026-01-11T00:00:00.000Z'),
    })

    expect(db.prepare('SELECT * FROM sync_state').all()).toHaveLength(1)
    const state = getSyncState(db, 1, 'game:g1')
    expect(state?.lastError).toBeNull()
    expect(state?.lastOkAt).toEqual(lastOkAt)
  })
})

describe('getAccount / setAccountStatus', () => {
  let db: DatabaseSync
  beforeEach(() => {
    db = seedDb()
  })

  it('reads an account', () => {
    expect(getAccount(db, 1)).toEqual({ id: 1, platform: 'steam', externalId: 'acc1' })
  })

  it('throws for an unknown account id', () => {
    expect(() => getAccount(db, 999)).toThrow()
  })

  it('updates the status column', () => {
    setAccountStatus(db, 1, 'needs_reauth')

    const row = db.prepare('SELECT status FROM account WHERE id = ?').get(1) as {
      status: string
    }
    expect(row.status).toBe('needs_reauth')
  })
})

describe('sync-store pipeline (the baseline rule end to end)', () => {
  it('a first sync records history silently; a later sync reports only the genuinely new unlock', () => {
    const db = seedDb()

    // First sync: an already-unlocked achievement must not read as "new" once baseline is set.
    upsertAchievements(db, 1, [
      {
        externalId: 'ach1',
        name: 'First Blood',
        description: null,
        iconUrl: null,
        iconLockedUrl: null,
        hidden: false,
        points: 10,
        tier: null,
        globalPercent: 42,
      },
    ])
    insertNewUnlocks(db, 1, [
      { achievementExternalId: 'ach1', unlockedAt: new Date('2025-01-01'), progress: null },
    ])
    setBaselineDone(db, 1)

    expect(db.prepare('SELECT * FROM unlock').all()).toHaveLength(1) // history preserved
    expect(getPlatformGameByExternalId(db, 1, 'g1').baselineDone).toBe(true)

    // Second sync: a genuinely new achievement unlocks alongside the already-known one.
    upsertAchievements(db, 1, [
      {
        externalId: 'ach2',
        name: 'Second',
        description: null,
        iconUrl: null,
        iconLockedUrl: null,
        hidden: false,
        points: 20,
        tier: null,
        globalPercent: 8,
      },
    ])
    const secondPassNew = insertNewUnlocks(db, 1, [
      { achievementExternalId: 'ach1', unlockedAt: new Date('2025-01-01'), progress: null }, // still old
      { achievementExternalId: 'ach2', unlockedAt: new Date(), progress: null }, // new
    ])

    expect(secondPassNew).toHaveLength(1)
    expect(secondPassNew[0]?.achievementExternalId).toBe('ach2')
    expect(db.prepare('SELECT * FROM unlock').all()).toHaveLength(2)
  })
})
