import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ActivityItem } from '@shared/library'
import type { RemoteAchievement, RemoteGame } from '@shared/models'
import type { Platform } from '@shared/platform'
import {
  getDashboardStats,
  getGameDetail,
  listActivity,
  listLibraryGames,
  listRecentUnlocks,
} from './library-store'
import { applyMigrations } from './migrate'
import { awardPlatinums } from './platinum'
import {
  addPlatformGames,
  getPlatformGameByExternalId,
  insertNewUnlocks,
  upsertAccount,
  upsertAchievements,
} from './sync-store'

const NOW = new Date('2026-09-23T12:00:00.000Z')
const DAY = 24 * 60 * 60_000

let db: DatabaseSync

function game(externalId: string, title: string): RemoteGame {
  return {
    ref: { externalId },
    title,
    iconUrl: null,
    coverUrl: `https://cover/${externalId}.jpg`,
    lastPlayed: null,
    recentlyPlayed: false,
  }
}

function achievement(
  externalId: string,
  overrides: Partial<RemoteAchievement> = {},
): RemoteAchievement {
  return {
    externalId,
    name: `Achievement ${externalId}`,
    description: `Do ${externalId}`,
    iconUrl: `https://icon/${externalId}.jpg`,
    iconLockedUrl: `https://icon/${externalId}-locked.jpg`,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: 50,
    ...overrides,
  }
}

interface Seeded {
  readonly gameId: number
  readonly platformGameId: number
}

function seedGame(
  externalId: string,
  title: string,
  total: number,
  unlockedAt: readonly (Date | null)[] = [],
  platform: Platform = 'steam',
  coverUrl: string | null = `https://cover/${externalId}.jpg`,
): Seeded {
  const account = upsertAccount(db, { platform, externalId: 'acc', displayName: 'Player' })
  addPlatformGames(db, account, [{ ...game(externalId, title), coverUrl }])
  const { id } = getPlatformGameByExternalId(db, account.id, externalId)
  upsertAchievements(
    db,
    id,
    Array.from({ length: total }, (_, i) =>
      achievement(`${externalId}-${i}`, { globalPercent: 10 * (i + 1) }),
    ),
  )
  insertNewUnlocks(
    db,
    id,
    unlockedAt.map((at, i) => ({
      achievementExternalId: `${externalId}-${i}`,
      unlockedAt: at,
      progress: null,
    })),
  )
  const row = db.prepare('SELECT game_id FROM platform_game WHERE id = ?').get(id) as {
    game_id: number
  }
  return { gameId: row.game_id, platformGameId: id }
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  applyMigrations(db)
})

function itemName(item: ActivityItem): string {
  return item.kind === 'achievement' ? item.name : `Platinum of ${item.gameTitle}`
}

function makePlatinum(
  platformGameId: number,
  index: number,
  change: { description?: string; tier?: string },
): void {
  db.prepare(
    `UPDATE achievement SET description = COALESCE(?, description), tier = ?
     WHERE platform_game_id = ? AND external_id LIKE ?`,
  ).run(change.description ?? null, change.tier ?? null, platformGameId, `%-${index}`)
}

describe('listLibraryGames', () => {
  it('lists each game with its cover, achievement counts and last unlock', () => {
    const { gameId } = seedGame('400', 'Portal', 3, [
      new Date('2026-09-01T10:00:00Z'),
      new Date('2026-09-05T10:00:00Z'),
    ])

    expect(listLibraryGames(db)).toEqual([
      {
        id: gameId,
        title: 'Portal',
        platforms: ['steam'],
        coverUrl: 'https://cover/400.jpg',
        unlocked: 2,
        total: 3,
        lastUnlockAt: new Date('2026-09-05T10:00:00Z'),
      },
    ])
  })

  it('shows a game not synced yet with no achievements', () => {
    seedGame('1', 'Fresh', 0)

    expect(listLibraryGames(db)[0]).toMatchObject({ unlocked: 0, total: 0, lastUnlockAt: null })
  })

  it('puts the most recently unlocked first, then games with no dated unlock by title', () => {
    seedGame('1', 'b game', 1)
    seedGame('2', 'Old', 1, [new Date('2026-01-01T00:00:00Z')])
    seedGame('3', 'A game', 1)
    seedGame('4', 'New', 1, [new Date('2026-09-01T00:00:00Z')])

    expect(listLibraryGames(db).map((g) => g.title)).toEqual(['New', 'Old', 'A game', 'b game'])
  })

  it('shows a linked game once, with the best platform, every badge and the shortest title', () => {
    const steam = seedGame('1', 'Apex Legends', 4, [new Date('2026-09-01T00:00:00Z')])
    seedGame('set-1', 'Apex Legends™', 2, [null, null], 'ea', null)
    seedGame('trophy/NPWR1', 'Apex Legends', 10, [new Date('2026-09-10T00:00:00Z')], 'playstation')

    expect(listLibraryGames(db)).toEqual([
      {
        id: steam.gameId,
        title: 'Apex Legends',
        platforms: ['ea', 'steam', 'playstation'],
        coverUrl: 'https://cover/1.jpg',
        unlocked: 2,
        total: 2,
        lastUnlockAt: new Date('2026-09-10T00:00:00Z'),
      },
    ])
  })

  it('breaks a tie on share by the most unlocked, and puts entries with no achievements last', () => {
    seedGame('1', 'Doom', 0)
    seedGame('trophy/NPWR1', 'Doom', 4, [null, null], 'playstation')
    seedGame('set-1', 'Doom', 2, [null], 'ea')

    expect(listLibraryGames(db)[0]).toMatchObject({
      platforms: ['playstation', 'ea', 'steam'],
      unlocked: 2,
      total: 4,
    })
  })
})

describe('getGameDetail', () => {
  it('returns the game and every achievement with its unlock state', () => {
    const { gameId, platformGameId } = seedGame('400', 'Portal', 2, [
      new Date('2026-09-01T10:00:00Z'),
    ])

    const detail = getGameDetail(db, gameId)

    expect(detail?.game).toMatchObject({ id: gameId, title: 'Portal', unlocked: 1, total: 2 })
    expect(detail?.entries).toHaveLength(1)
    expect(detail?.entries[0]).toMatchObject({
      platformGameId,
      platform: 'steam',
      tag: null,
      title: 'Portal',
      unlocked: 1,
      total: 2,
    })
    expect(detail?.entries[0]?.achievements).toEqual([
      expect.objectContaining({
        name: 'Achievement 400-0',
        description: 'Do 400-0',
        hidden: false,
        iconUrl: 'https://icon/400-0.jpg',
        iconLockedUrl: 'https://icon/400-0-locked.jpg',
        globalPercent: 10,
        unlocked: true,
        unlockedAt: new Date('2026-09-01T10:00:00Z'),
      }),
      expect.objectContaining({ name: 'Achievement 400-1', unlocked: false, unlockedAt: null }),
    ])
  })

  it('counts an unlock with no date as unlocked', () => {
    const { gameId } = seedGame('400', 'Portal', 1, [null])

    expect(getGameDetail(db, gameId)?.entries[0]?.achievements[0]).toMatchObject({
      unlocked: true,
      unlockedAt: null,
    })
  })

  it('lists every linked entry, best first, tagging entries that share a platform', () => {
    const steam = seedGame('2322010', 'God of War Ragnarök', 10, [null])
    const ps4 = seedGame(
      'trophy/NPWR1',
      'God of War Ragnarök (PS4)',
      4,
      [null, null],
      'playstation',
    )
    const ps5 = seedGame(
      'trophy2/NPWR2',
      'God of War Ragnarök (PS5 / PC)',
      2,
      [null, null],
      'playstation',
    )

    const detail = getGameDetail(db, steam.gameId)

    expect(detail?.game).toMatchObject({ title: 'God of War Ragnarök', unlocked: 2, total: 2 })
    expect(
      detail?.entries.map((entry) => [
        entry.platformGameId,
        entry.platform,
        entry.tag,
        entry.total,
      ]),
    ).toEqual([
      [ps5.platformGameId, 'playstation', 'PS5 / PC', 2],
      [ps4.platformGameId, 'playstation', 'PS4', 4],
      [steam.platformGameId, 'steam', null, 10],
    ])
    expect(detail?.entries[2]?.achievements).toHaveLength(10)
  })

  it('returns null for a game that does not exist', () => {
    expect(getGameDetail(db, 999)).toBeNull()
  })
})

describe('listRecentUnlocks', () => {
  it('lists dated unlocks newest first, with their game, up to the limit', () => {
    const portal = seedGame('400', 'Portal', 3, [
      new Date('2026-09-01T10:00:00Z'),
      null,
      new Date('2026-09-03T10:00:00Z'),
    ])
    seedGame('500', 'Half-Life', 1, [new Date('2026-09-02T10:00:00Z')])

    const recent = listRecentUnlocks(db, 2)

    expect(recent.map((u) => u.name)).toEqual(['Achievement 400-2', 'Achievement 500-0'])
    expect(recent[0]).toMatchObject({
      gameId: portal.gameId,
      platformGameId: portal.platformGameId,
      gameTitle: 'Portal',
      platform: 'steam',
      description: 'Do 400-2',
      globalPercent: 30,
      unlockedAt: new Date('2026-09-03T10:00:00Z'),
    })
  })
})

describe('listActivity', () => {
  it('returns up to the limit, newest first, and says there are more', () => {
    seedGame('400', 'Portal', 3, [
      new Date('2026-09-01T10:00:00Z'),
      new Date('2026-09-02T10:00:00Z'),
      new Date('2026-09-03T10:00:00Z'),
    ])

    const page = listActivity(db, 2)

    expect(page.unlocks.map(itemName)).toEqual(['Achievement 400-2', 'Achievement 400-1'])
    expect(page.hasMore).toBe(true)
  })

  it('says there are no more once every dated unlock is in the page', () => {
    seedGame('400', 'Portal', 3, [
      new Date('2026-09-01T10:00:00Z'),
      null,
      new Date('2026-09-03T10:00:00Z'),
    ])

    const page = listActivity(db, 2)

    expect(page.unlocks).toHaveLength(2)
    expect(page.hasMore).toBe(false)
  })

  it('returns an empty page when nothing is unlocked', () => {
    expect(listActivity(db, 50)).toEqual({ unlocks: [], hasMore: false })
  })
})

describe('listRecentUnlocks without dates', () => {
  it('leaves out unlocks the platform did not date', () => {
    seedGame('400', 'Portal', 2, [null, null])

    expect(listRecentUnlocks(db, 6)).toEqual([])
  })
})

describe('getDashboardStats', () => {
  it('adds up achievements, games, completed games and this week’s unlocks', () => {
    seedGame('1', 'Done', 2, [new Date(NOW.getTime() - 2 * DAY), new Date(NOW.getTime() - 8 * DAY)])
    seedGame('2', 'Half', 2, [new Date(NOW.getTime() - DAY)])
    seedGame('3', 'Unsynced', 0)

    expect(getDashboardStats(db, NOW)).toMatchObject({
      unlockedAchievements: 3,
      totalAchievements: 4,
      gamesTracked: 3,
      completedGames: 1,
      unlockedThisWeek: 2,
    })
  })

  it('lists unfinished games closest to 100% first, leaving out finished and unsynced ones', () => {
    seedGame('1', 'Done', 1, [null])
    seedGame('2', 'Quarter', 4, [null])
    seedGame('3', 'Three quarters', 4, [null, null, null])
    seedGame('4', 'Unsynced', 0)
    seedGame('5', 'Half', 2, [null])

    expect(getDashboardStats(db, NOW).nearlyThere.map((g) => g.title)).toEqual([
      'Three quarters',
      'Half',
      'Quarter',
    ])
  })

  it('shows at most four nearly-finished games and six recent unlocks', () => {
    for (let i = 0; i < 6; i++) {
      seedGame(String(i), `Game ${i}`, 10, [new Date(NOW.getTime() - i * DAY), null])
    }

    const stats = getDashboardStats(db, NOW)

    expect(stats.nearlyThere).toHaveLength(4)
    expect(stats.recentUnlocks).toHaveLength(6)
  })

  it('counts a linked game once but adds up the achievements of every platform', () => {
    seedGame('1', 'Apex Legends', 2, [null, null])
    seedGame('trophy/NPWR1', 'Apex Legends', 4, [null], 'playstation')
    seedGame('2', 'Portal', 4, [null, null, null])

    expect(getDashboardStats(db, NOW)).toMatchObject({
      unlockedAchievements: 6,
      totalAchievements: 10,
      gamesTracked: 2,
      completedGames: 1,
    })
    expect(getDashboardStats(db, NOW).nearlyThere.map((g) => g.title)).toEqual(['Portal'])
  })

  it('adds up games and achievements per platform, most unlocked first', () => {
    seedGame('1', 'Portal', 4, [null])
    seedGame('2', 'Unsynced', 0)
    seedGame('trophy/NPWR1', 'Apex Legends', 3, [null, null], 'playstation')
    seedGame('trophy/NPWR2', 'Astro Bot', 2, [null, null], 'playstation')

    expect(getDashboardStats(db, NOW).platforms).toEqual([
      { platform: 'playstation', games: 2, unlocked: 4, total: 5 },
      { platform: 'steam', games: 2, unlocked: 1, total: 4 },
    ])
  })

  it('lists no platforms before any account has games', () => {
    expect(getDashboardStats(db, NOW).platforms).toEqual([])
  })

  it('lists the rarest unlocks first, newest first on a tie, with their game, up to five', () => {
    const at = new Date(NOW.getTime() - DAY)
    const { gameId, platformGameId } = seedGame('400', 'Portal', 4, [at, at, at, at])
    const earlier = new Date(NOW.getTime() - 3 * DAY)
    seedGame('500', 'Celeste', 3, [earlier, null, earlier])

    const rarest = getDashboardStats(db, NOW).rarestUnlocks

    expect(rarest.map((u) => [u.gameTitle, u.globalPercent])).toEqual([
      ['Portal', 10],
      ['Celeste', 10],
      ['Portal', 20],
      ['Celeste', 20],
      ['Portal', 30],
    ])
    expect(rarest[0]).toEqual({
      achievementId: expect.any(Number),
      gameId,
      platformGameId,
      gameTitle: 'Portal',
      platform: 'steam',
      name: 'Achievement 400-0',
      description: 'Do 400-0',
      iconUrl: 'https://icon/400-0.jpg',
      globalPercent: 10,
      platinum: false,
      unlockedAt: at,
    })
    expect(rarest[3]?.unlockedAt).toBeNull()
  })

  it('leaves locked achievements and ones with no rarity out of the rarest unlocks', () => {
    seedGame('400', 'Portal', 3, [null])
    const { platformGameId } = seedGame('500', 'Unrated', 1, [null], 'ubisoft')
    db.prepare('UPDATE achievement SET global_percent = NULL WHERE platform_game_id = ?').run(
      platformGameId,
    )

    expect(getDashboardStats(db, NOW).rarestUnlocks.map((u) => u.name)).toEqual([
      'Achievement 400-0',
    ])
  })
})

describe('platinums', () => {
  const T1 = new Date('2026-09-20T10:00:00Z')
  const T2 = new Date('2026-09-24T10:00:00Z')
  const T3 = new Date('2026-09-26T10:00:00Z')

  it("marks a game's own platinum, found by its description or its tier", () => {
    const steam = seedGame('1', 'ELDEN RING', 3, [T1])
    makePlatinum(steam.platformGameId, 2, { description: 'Obtained all achievements' })
    const psn = seedGame('trophy/NPWR1', 'Astro Bot', 2, [T1], 'playstation')
    makePlatinum(psn.platformGameId, 1, { tier: 'platinum' })

    const flags = (gameId: number) =>
      getGameDetail(db, gameId)?.entries[0]?.achievements.map((a) => a.platinum)

    expect(flags(steam.gameId)).toEqual([false, false, true])
    expect(flags(psn.gameId)).toEqual([false, true])
  })

  it('gives an entry its app-awarded Platinum, unless it has its own', () => {
    const done = seedGame('1', 'Portal', 2, [T1, T2])
    const unfinished = seedGame('2', 'Half-Life', 2, [T1])
    awardPlatinums(db)

    expect(getGameDetail(db, done.gameId)?.entries[0]?.appPlatinum).toEqual({ earnedAt: T2 })
    expect(getGameDetail(db, unfinished.gameId)?.entries[0]?.appPlatinum).toBeNull()

    makePlatinum(done.platformGameId, 1, { description: 'Unlock all achievements' })
    expect(getGameDetail(db, done.gameId)?.entries[0]?.appPlatinum).toBeNull()
  })

  it('marks platinums among recent and rarest unlocks', () => {
    const { platformGameId } = seedGame('1', 'ELDEN RING', 2, [T1, T2])
    makePlatinum(platformGameId, 1, { description: 'Obtained all achievements' })

    expect(listRecentUnlocks(db, 6).map((u) => [u.kind, u.name, u.platinum])).toEqual([
      ['achievement', 'Achievement 1-1', true],
      ['achievement', 'Achievement 1-0', false],
    ])
    expect(getDashboardStats(db, NOW).rarestUnlocks.map((u) => u.platinum)).toEqual([false, true])
  })

  it('puts dated app-awarded Platinums in Activity, above the unlock that earned them', () => {
    const portal = seedGame('1', 'Portal', 2, [T1, T2])
    seedGame('2', 'Celeste', 2, [T3])
    seedGame('3', 'Undated', 1, [null])
    awardPlatinums(db)

    const page = listActivity(db, 10)

    expect(page.unlocks.map(itemName)).toEqual([
      'Achievement 2-0',
      'Platinum of Portal',
      'Achievement 1-1',
      'Achievement 1-0',
    ])
    expect(page.unlocks[1]).toEqual({
      kind: 'platinum',
      gameId: portal.gameId,
      platformGameId: portal.platformGameId,
      gameTitle: 'Portal',
      platform: 'steam',
      unlockedAt: T2,
    })
    expect(page.hasMore).toBe(false)
  })

  it('counts platinums within the Activity limit', () => {
    seedGame('1', 'Portal', 2, [T1, T2])
    seedGame('2', 'Celeste', 2, [T3])
    awardPlatinums(db)

    const page = listActivity(db, 2)

    expect(page.unlocks.map(itemName)).toEqual(['Achievement 2-0', 'Platinum of Portal'])
    expect(page.hasMore).toBe(true)
  })

  it('counts every platinum held on the Dashboard, one per entry', () => {
    const own = seedGame('1', 'ELDEN RING', 2, [T1, T2])
    makePlatinum(own.platformGameId, 1, { description: 'Obtained all achievements' })
    const trophy = seedGame('trophy/NPWR1', 'Astro Bot', 2, [T1, T2], 'playstation')
    makePlatinum(trophy.platformGameId, 1, { tier: 'platinum' })
    const locked = seedGame('2', 'Sekiro', 2, [T1])
    makePlatinum(locked.platformGameId, 1, { description: 'All achievements have been unlocked.' })
    seedGame('3', 'Portal', 1, [T1])
    seedGame('4', 'Half-Life', 2, [T1])
    awardPlatinums(db)

    expect(getDashboardStats(db, NOW).platinums).toBe(3)
  })
})
