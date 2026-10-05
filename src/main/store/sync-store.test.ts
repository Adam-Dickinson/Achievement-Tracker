import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations } from './migrate'
import { awardPlatinums } from './platinum'
import type { RemoteGame } from '@shared/models'
import {
  addPlatformGames,
  deleteAccountData,
  getAccount,
  getAccountStatus,
  getPlatformGameByExternalId,
  getSyncState,
  insertNewUnlocks,
  listAccountSummaries,
  listConnectedAccounts,
  listConnectedEntries,
  listPlatformGameExternalIds,
  setAccountStatus,
  setBaselineDone,
  upsertAccount,
  upsertAchievements,
  upsertSyncState,
} from './sync-store'

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
      baselineCutoff: null,
    })
  })

  it('reads a baseline cutoff as a Date', () => {
    db.exec(`UPDATE platform_game SET baseline_cutoff = '2026-09-23T10:00:00.000Z' WHERE id = 1`)

    expect(getPlatformGameByExternalId(db, 1, 'g1').baselineCutoff).toEqual(
      new Date('2026-09-23T10:00:00.000Z'),
    )
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
    const secondPass = insertNewUnlocks(db, 1, [unlock])

    expect(firstPass).toHaveLength(1)
    expect(secondPass).toHaveLength(0)
    expect(db.prepare('SELECT * FROM unlock').all()).toHaveLength(1)
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

describe('listConnectedAccounts', () => {
  it('lists only connected accounts, leaving out ones needing re-login or disabled', () => {
    const db = seedDb()
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at) VALUES
        (2, 'xbox', 'acc2', 'Needs login', 'needs_reauth', '2026-01-01'),
        (3, 'steam', 'acc3', 'Off', 'disabled', '2026-01-01'),
        (4, 'retroachievements', 'acc4', 'Also on', 'connected', '2026-01-01')
    `)

    expect(listConnectedAccounts(db)).toEqual([
      { id: 1, platform: 'steam', externalId: 'acc1' },
      { id: 4, platform: 'retroachievements', externalId: 'acc4' },
    ])
  })
})

describe('listPlatformGameExternalIds', () => {
  it("lists one account's games only", () => {
    const db = seedDb()
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (2, 'steam', 'acc2', 'Other', 'connected', '2026-01-01')
    `)
    db.exec(`INSERT INTO game (id, title, sort_title) VALUES (2, 'B', 'b'), (3, 'C', 'c')`)
    db.exec(`
      INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title) VALUES
        (2, 2, 1, 'steam', 'g2', 'B'),
        (3, 3, 2, 'steam', 'other-account-game', 'C')
    `)

    expect(listPlatformGameExternalIds(db, 1)).toEqual(['g1', 'g2'])
  })

  it('is empty for an account with no games yet', () => {
    const db = seedDb()
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (2, 'steam', 'acc2', 'New', 'connected', '2026-01-01')
    `)

    expect(listPlatformGameExternalIds(db, 2)).toEqual([])
  })
})

describe('sync-store pipeline (the baseline rule end to end)', () => {
  it('a first sync records history silently; a later sync reports only the genuinely new unlock', () => {
    const db = seedDb()

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

    expect(db.prepare('SELECT * FROM unlock').all()).toHaveLength(1)
    expect(getPlatformGameByExternalId(db, 1, 'g1').baselineDone).toBe(true)

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

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  return db
}

function accountRows(db: DatabaseSync): unknown[] {
  return db.prepare('SELECT * FROM account ORDER BY id').all()
}

describe('listAccountSummaries', () => {
  it("counts each account's own unlocks", () => {
    const db = seedDb()
    upsertAchievements(
      db,
      1,
      ['a', 'b', 'c'].map((externalId) => ({
        externalId,
        name: externalId,
        description: null,
        iconUrl: null,
        iconLockedUrl: null,
        hidden: false,
        points: null,
        tier: null,
        globalPercent: null,
      })),
    )
    insertNewUnlocks(db, 1, [
      { achievementExternalId: 'a', unlockedAt: new Date('2026-01-05T00:00:00Z'), progress: null },
      { achievementExternalId: 'b', unlockedAt: null, progress: null },
    ])

    expect(listAccountSummaries(db).map((account) => account.unlockedCount)).toEqual([2])
  })

  it('lists every account with its status and number of games, in id order', () => {
    const db = freshDb()
    const steam = upsertAccount(db, {
      platform: 'steam',
      externalId: '76561190000000001',
      displayName: 'Player One',
    })
    const other = upsertAccount(db, {
      platform: 'steam',
      externalId: '76561190000000002',
      displayName: 'Player Two',
    })
    setAccountStatus(db, other.id, 'needs_reauth')
    addPlatformGames(db, steam, [
      {
        ref: { externalId: '1' },
        title: 'A',
        iconUrl: null,
        coverUrl: null,
        lastPlayed: null,
        recentlyPlayed: false,
      },
      {
        ref: { externalId: '2' },
        title: 'B',
        iconUrl: null,
        coverUrl: null,
        lastPlayed: null,
        recentlyPlayed: false,
      },
    ])

    expect(listAccountSummaries(db)).toEqual([
      {
        id: steam.id,
        platform: 'steam',
        displayName: 'Player One',
        status: 'connected',
        gameCount: 2,
        checkedGames: 0,
        unlockedCount: 0,
        lastSyncAt: null,
        syncing: false,
      },
      {
        id: other.id,
        platform: 'steam',
        displayName: 'Player Two',
        status: 'needs_reauth',
        gameCount: 0,
        checkedGames: 0,
        unlockedCount: 0,
        lastSyncAt: null,
        syncing: false,
      },
    ])
  })

  it('is empty when no account is connected', () => {
    expect(listAccountSummaries(freshDb())).toEqual([])
  })
})

describe('upsertAccount', () => {
  const STEAM = {
    platform: 'steam' as const,
    externalId: '76561190000000001',
    displayName: 'Test',
  }

  it('creates a connected account and returns its row', () => {
    const db = freshDb()

    const account = upsertAccount(db, STEAM, new Date('2026-09-23T10:00:00Z'))

    expect(account).toEqual({ id: 1, platform: 'steam', externalId: '76561190000000001' })
    expect(accountRows(db)).toEqual([
      {
        id: 1,
        platform: 'steam',
        external_id: '76561190000000001',
        display_name: 'Test',
        status: 'connected',
        last_sync_at: null,
        created_at: '2026-09-23T10:00:00.000Z',
      },
    ])
  })

  it('reconnecting keeps the same id, refreshes the name and sets connected again', () => {
    const db = freshDb()
    const first = upsertAccount(db, STEAM, new Date('2026-09-23T10:00:00Z'))
    setAccountStatus(db, first.id, 'needs_reauth')

    const again = upsertAccount(
      db,
      { ...STEAM, displayName: 'Renamed' },
      new Date('2026-09-24T10:00:00Z'),
    )

    expect(again.id).toBe(first.id)
    expect(accountRows(db)).toHaveLength(1)
    expect(accountRows(db)[0]).toMatchObject({
      display_name: 'Renamed',
      status: 'connected',
      created_at: '2026-09-23T10:00:00.000Z',
    })
  })

  it('keeps accounts apart when the platform or the external id differs', () => {
    const db = freshDb()

    const steam = upsertAccount(db, STEAM)
    const other = upsertAccount(db, { ...STEAM, externalId: '76561190000000002' })
    const ra = upsertAccount(db, { ...STEAM, platform: 'retroachievements' })

    expect(new Set([steam.id, other.id, ra.id]).size).toBe(3)
  })
})

describe('addPlatformGames', () => {
  function remoteGame(externalId: string, overrides: Partial<RemoteGame> = {}): RemoteGame {
    return {
      ref: { externalId },
      title: `Game ${externalId}`,
      iconUrl: `https://img/${externalId}.jpg`,
      coverUrl: `https://img/${externalId}-cover.jpg`,
      lastPlayed: new Date('2026-09-01T12:00:00Z'),
      recentlyPlayed: false,
      ...overrides,
    }
  }

  function platformGames(db: DatabaseSync): Record<string, unknown>[] {
    return db
      .prepare(
        'SELECT game_id, external_id, title, icon_url, last_played, baseline_done FROM platform_game ORDER BY id',
      )
      .all()
  }

  function setup() {
    const db = freshDb()
    const account = upsertAccount(db, {
      platform: 'steam',
      externalId: '76561190000000001',
      displayName: 'Test',
    })
    return { db, account }
  }

  it('adds a new game as a canonical game plus a platform game awaiting its silent first sync', () => {
    const { db, account } = setup()

    const added = addPlatformGames(db, account, [remoteGame('400', { title: 'Portal' })])

    expect(added).toBe(1)
    expect(platformGames(db)).toEqual([
      {
        game_id: 1,
        external_id: '400',
        title: 'Portal',
        icon_url: 'https://img/400.jpg',
        last_played: '2026-09-01T12:00:00.000Z',
        baseline_done: 0,
      },
    ])
    expect(db.prepare('SELECT id, title, sort_title FROM game').all()).toEqual([
      { id: 1, title: 'Portal', sort_title: 'portal' },
    ])
  })

  it('stores tall and hero art, keeping what it had when a later sync has none', () => {
    const { db, account } = setup()
    const art = () =>
      db
        .prepare('SELECT portrait_url, hero_url FROM platform_game WHERE external_id = ?')
        .get('400')

    addPlatformGames(db, account, [
      remoteGame('400', { portraitUrl: 'https://img/tall.jpg', heroUrl: 'https://img/hero.jpg' }),
    ])
    expect(art()).toEqual({
      portrait_url: 'https://img/tall.jpg',
      hero_url: 'https://img/hero.jpg',
    })

    addPlatformGames(db, account, [remoteGame('400', { portraitUrl: null })])
    expect(art()).toEqual({
      portrait_url: 'https://img/tall.jpg',
      hero_url: 'https://img/hero.jpg',
    })

    addPlatformGames(db, account, [remoteGame('400', { heroUrl: 'https://img/hero2.jpg' })])
    expect(art()).toEqual({
      portrait_url: 'https://img/tall.jpg',
      hero_url: 'https://img/hero2.jpg',
    })
  })

  it('stores a store link, keeping the old one when a later sync has none', () => {
    const { db, account } = setup()
    const storeUrl = () =>
      db.prepare('SELECT store_url FROM platform_game WHERE external_id = ?').get('400')

    addPlatformGames(db, account, [
      remoteGame('400', { storeUrl: 'steam://nav/games/details/400' }),
    ])
    expect(storeUrl()).toEqual({ store_url: 'steam://nav/games/details/400' })

    addPlatformGames(db, account, [remoteGame('400')])
    expect(storeUrl()).toEqual({ store_url: 'steam://nav/games/details/400' })

    addPlatformGames(db, account, [
      remoteGame('400', { storeUrl: 'steam://nav/games/details/401' }),
    ])
    expect(storeUrl()).toEqual({ store_url: 'steam://nav/games/details/401' })
  })

  it('stores the baseline cutoff on new games only, leaving it null by default', () => {
    const { db, account } = setup()
    const cutoff = new Date('2026-09-23T10:00:00Z')

    addPlatformGames(db, account, [remoteGame('first')])
    addPlatformGames(db, account, [remoteGame('first'), remoteGame('later')], cutoff)

    expect(getPlatformGameByExternalId(db, account.id, 'first').baselineCutoff).toBeNull()
    expect(getPlatformGameByExternalId(db, account.id, 'later').baselineCutoff).toEqual(cutoff)
  })

  it('gives each new game its own canonical game row', () => {
    const { db, account } = setup()

    addPlatformGames(db, account, [remoteGame('1'), remoteGame('2')])

    expect(platformGames(db).map((game) => game.game_id)).toEqual([1, 2])
  })

  it('stores the cover on the platform game, and updates it when a later list has one', () => {
    const { db, account } = setup()
    const cover = (): unknown =>
      (db.prepare('SELECT cover_url FROM platform_game').get() as { cover_url: string | null })
        .cover_url

    addPlatformGames(db, account, [remoteGame('1', { coverUrl: null })])
    expect(cover()).toBeNull()

    addPlatformGames(db, account, [remoteGame('1')])
    expect(cover()).toBe('https://img/1-cover.jpg')

    addPlatformGames(db, account, [remoteGame('1', { coverUrl: null })])
    expect(cover()).toBe('https://img/1-cover.jpg')
  })

  it('replaces a stored cover with a changed one', () => {
    const { db, account } = setup()
    const cover = (): unknown =>
      (db.prepare('SELECT cover_url FROM platform_game').get() as { cover_url: string | null })
        .cover_url

    addPlatformGames(db, account, [remoteGame('1', { coverUrl: 'file:///D:/old/ICON0.PNG' })])
    addPlatformGames(db, account, [
      remoteGame('1', { coverUrl: 'trophy-art://rpcs3/NPWR00881_00' }),
    ])

    expect(cover()).toBe('trophy-art://rpcs3/NPWR00881_00')
  })

  it('links a new game to an existing game with the same cleaned title, on any account', () => {
    const { db, account } = setup()
    const playstation = upsertAccount(db, {
      platform: 'playstation',
      externalId: '1234567890123456789',
      displayName: 'Test',
    })

    addPlatformGames(db, account, [remoteGame('1', { title: 'Apex Legends' })])
    addPlatformGames(db, playstation, [
      remoteGame('trophy2/NPWR1', { title: 'Apex Legends™' }),
      remoteGame('trophy2/NPWR2', { title: 'Destiny 2' }),
    ])

    expect(platformGames(db).map((game) => game.game_id)).toEqual([1, 1, 2])
  })

  it('stores a never-played game, or one without an icon, with nulls', () => {
    const { db, account } = setup()

    addPlatformGames(db, account, [remoteGame('1', { lastPlayed: null, iconUrl: null })])

    expect(platformGames(db)[0]).toMatchObject({ icon_url: null, last_played: null })
  })

  it('adding the same list again creates no duplicates and reports nothing new', () => {
    const { db, account } = setup()
    addPlatformGames(db, account, [remoteGame('1'), remoteGame('2')])

    const added = addPlatformGames(db, account, [remoteGame('1'), remoteGame('2')])

    expect(added).toBe(0)
    expect(platformGames(db)).toHaveLength(2)
    expect(db.prepare('SELECT COUNT(*) AS n FROM game').get()).toEqual({ n: 2 })
  })

  it('counts only the games that are new', () => {
    const { db, account } = setup()
    addPlatformGames(db, account, [remoteGame('1')])

    expect(addPlatformGames(db, account, [remoteGame('1'), remoteGame('2')])).toBe(1)
  })

  it('updates the title, icon and last played time of a known game', () => {
    const { db, account } = setup()
    addPlatformGames(db, account, [remoteGame('1')])

    addPlatformGames(db, account, [
      remoteGame('1', {
        title: 'New title',
        iconUrl: 'https://img/new.jpg',
        lastPlayed: new Date('2026-09-20T08:00:00Z'),
      }),
    ])

    expect(platformGames(db)[0]).toMatchObject({
      title: 'New title',
      icon_url: 'https://img/new.jpg',
      last_played: '2026-09-20T08:00:00.000Z',
    })
  })

  it('keeps the known last played time when the new list has none (a borrowed game)', () => {
    const { db, account } = setup()
    addPlatformGames(db, account, [remoteGame('1')])

    addPlatformGames(db, account, [remoteGame('1', { lastPlayed: null })])

    expect(platformGames(db)[0]?.last_played).toBe('2026-09-01T12:00:00.000Z')
  })

  it('never resets a finished baseline, so a known game is not silenced again', () => {
    const { db, account } = setup()
    addPlatformGames(db, account, [remoteGame('1')])
    setBaselineDone(db, 1)

    addPlatformGames(db, account, [remoteGame('1')])

    expect(platformGames(db)[0]?.baseline_done).toBe(1)
  })

  it('never forgets a game that is missing from a later list (SPEC §5)', () => {
    const { db, account } = setup()
    addPlatformGames(db, account, [remoteGame('1'), remoteGame('borrowed')])

    addPlatformGames(db, account, [remoteGame('1')])

    expect(platformGames(db).map((game) => game.external_id)).toEqual(['1', 'borrowed'])
  })

  it('keeps each account’s games separate, even with the same external id', () => {
    const { db, account } = setup()
    const other = upsertAccount(db, {
      platform: 'steam',
      externalId: '76561190000000002',
      displayName: 'Other',
    })

    addPlatformGames(db, account, [remoteGame('400')])
    const added = addPlatformGames(db, other, [remoteGame('400')])

    expect(added).toBe(1)
    expect(listPlatformGameExternalIds(db, account.id)).toEqual(['400'])
    expect(listPlatformGameExternalIds(db, other.id)).toEqual(['400'])
  })
})

function remoteGame(externalId: string, title: string): RemoteGame {
  return {
    ref: { externalId },
    title,
    iconUrl: null,
    coverUrl: null,
    lastPlayed: null,
    recentlyPlayed: false,
  }
}

function seedWithUnlock(db: DatabaseSync, platform: 'steam' | 'xbox', title: string) {
  const account = upsertAccount(db, { platform, externalId: `${platform}-1`, displayName: 'P' })
  addPlatformGames(db, account, [remoteGame(`${platform}-game`, title)])
  const { id } = getPlatformGameByExternalId(db, account.id, `${platform}-game`)
  upsertAchievements(db, id, [
    {
      externalId: 'a1',
      name: 'First',
      description: null,
      iconUrl: null,
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: null,
      globalPercent: 10,
    },
  ])
  insertNewUnlocks(db, id, [{ achievementExternalId: 'a1', unlockedAt: null, progress: null }])
  upsertSyncState(db, account.id, `game:${platform}-game`, {
    cursor: null,
    lastOkAt: new Date('2026-09-26T08:00:00.000Z'),
    lastError: null,
    nextDueAt: null,
  })
  return account
}

function count(db: DatabaseSync, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

describe('listAccountSummaries sync progress', () => {
  it('counts the games checked at least once, successfully or not, and the last success', () => {
    const db = freshDb()
    const account = upsertAccount(db, { platform: 'steam', externalId: 's', displayName: 'P' })
    addPlatformGames(db, account, [
      remoteGame('1', 'A'),
      remoteGame('2', 'B'),
      remoteGame('3', 'C'),
    ])
    upsertSyncState(db, account.id, 'game:1', {
      cursor: null,
      lastOkAt: new Date('2026-09-26T08:00:00.000Z'),
      lastError: null,
      nextDueAt: null,
    })
    upsertSyncState(db, account.id, 'game:2', {
      cursor: null,
      lastOkAt: null,
      lastError: 'offline',
      nextDueAt: null,
    })
    upsertSyncState(db, account.id, 'library', {
      cursor: null,
      lastOkAt: new Date('2026-09-26T09:00:00.000Z'),
      lastError: null,
      nextDueAt: null,
    })

    expect(listAccountSummaries(db)[0]).toMatchObject({
      gameCount: 3,
      checkedGames: 2,
      unlockedCount: 0,
      lastSyncAt: new Date('2026-09-26T09:00:00.000Z'),
    })
  })

  it('asks whether each account is syncing now', () => {
    const db = freshDb()
    const first = upsertAccount(db, { platform: 'steam', externalId: 's', displayName: 'P' })
    upsertAccount(db, { platform: 'xbox', externalId: 'x', displayName: 'P' })

    const summaries = listAccountSummaries(db, (id) => id === first.id)

    expect(summaries.map((summary) => summary.syncing)).toEqual([true, false])
  })
})

describe('getAccountStatus', () => {
  it("returns an account's status, or null when there is no such account", () => {
    const db = freshDb()
    const account = upsertAccount(db, { platform: 'steam', externalId: 's', displayName: 'P' })
    setAccountStatus(db, account.id, 'needs_reauth')

    expect(getAccountStatus(db, account.id)).toBe('needs_reauth')
    expect(getAccountStatus(db, 99)).toBeNull()
  })
})

describe('deleteAccountData', () => {
  it('removes the account with its games, achievements, unlocks, platinums and sync state', () => {
    const db = freshDb()
    const account = seedWithUnlock(db, 'steam', 'Portal')

    awardPlatinums(db)
    expect(count(db, 'platinum')).toBe(1)

    deleteAccountData(db, account.id)

    for (const table of [
      'account',
      'platform_game',
      'achievement',
      'unlock',
      'sync_state',
      'platinum',
    ]) {
      expect(count(db, table)).toBe(0)
    }
    expect(count(db, 'game')).toBe(0)
    expect(count(db, 'game_alias')).toBe(0)
  })

  it('keeps a linked game, and its other platform, when one account goes', () => {
    const db = freshDb()
    const steam = seedWithUnlock(db, 'steam', 'Portal')
    const xbox = seedWithUnlock(db, 'xbox', 'Portal')

    deleteAccountData(db, steam.id)

    expect(accountRows(db)).toHaveLength(1)
    expect(count(db, 'game')).toBe(1)
    expect(count(db, 'unlock')).toBe(1)
    expect(listPlatformGameExternalIds(db, xbox.id)).toEqual(['xbox-game'])
  })
})

describe('listConnectedEntries', () => {
  it("lists a game's entries on connected accounts only", () => {
    const db = freshDb()
    const steam = seedWithUnlock(db, 'steam', 'Portal')
    const xbox = seedWithUnlock(db, 'xbox', 'Portal')
    const gameId = (
      db.prepare('SELECT game_id FROM platform_game LIMIT 1').get() as { game_id: number }
    ).game_id

    expect(listConnectedEntries(db, gameId)).toEqual([
      { accountId: steam.id, externalId: 'steam-game' },
      { accountId: xbox.id, externalId: 'xbox-game' },
    ])

    setAccountStatus(db, xbox.id, 'disabled')
    expect(listConnectedEntries(db, gameId)).toEqual([
      { accountId: steam.id, externalId: 'steam-game' },
    ])
  })
})
