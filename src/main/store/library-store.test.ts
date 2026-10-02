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
  storePageUrl,
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

function sumOf<K extends string>(rows: readonly Record<K, number>[], key: K): number {
  return rows.reduce((total, row) => total + row[key], 0)
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

function renameAchievement(externalId: string, name: string): void {
  db.prepare('UPDATE achievement SET name = ? WHERE external_id = ?').run(name, externalId)
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
        portraitUrl: null,
        heroUrl: null,
        unlocked: 2,
        total: 3,
        lastUnlockAt: new Date('2026-09-05T10:00:00Z'),
      },
    ])
  })

  it('takes the tall and hero art from the best entry, else from any entry that has it', () => {
    const steam = seedGame('1', 'Apex Legends', 4, [new Date('2026-09-01T00:00:00Z')])
    const ea = seedGame('set-1', 'Apex Legends', 2, [null, null], 'ea')
    const art = db.prepare('UPDATE platform_game SET portrait_url = ?, hero_url = ? WHERE id = ?')
    art.run('https://steam/tall.jpg', 'https://steam/hero.jpg', steam.platformGameId)
    art.run('https://ea/tall.jpg', null, ea.platformGameId)

    expect(listLibraryGames(db)[0]).toMatchObject({
      portraitUrl: 'https://ea/tall.jpg',
      heroUrl: 'https://steam/hero.jpg',
    })
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
        portraitUrl: null,
        heroUrl: null,
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

describe('store pages', () => {
  it("says whether each entry has a store page, and gives its link by the entry's id", () => {
    const steam = seedGame('400', 'Portal', 1)
    const xbox = seedGame('2079757188', 'Portal', 1, [], 'xbox')
    db.prepare('UPDATE platform_game SET store_url = ? WHERE id = ?').run(
      'steam://nav/games/details/400',
      steam.platformGameId,
    )
    db.prepare('UPDATE platform_game SET store_url = NULL WHERE id = ?').run(xbox.platformGameId)

    const entries = getGameDetail(db, steam.gameId)?.entries ?? []

    expect(entries.map((entry) => [entry.platform, entry.hasStorePage])).toEqual([
      ['steam', true],
      ['xbox', false],
    ])
    expect(storePageUrl(db, steam.platformGameId)).toBe('steam://nav/games/details/400')
    expect(storePageUrl(db, xbox.platformGameId)).toBeNull()
    expect(storePageUrl(db, 999)).toBeNull()
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

describe('icons borrowed from a linked PlayStation entry', () => {
  function seedTrophies(
    platform: Platform,
    externalId: string,
    title: string,
    trophies: readonly RemoteAchievement[],
    unlockedIds: readonly string[] = [],
  ): Seeded {
    const account = upsertAccount(db, { platform, externalId: 'acc', displayName: 'Player' })
    addPlatformGames(db, account, [game(externalId, title)])
    const { id } = getPlatformGameByExternalId(db, account.id, externalId)
    upsertAchievements(db, id, trophies)
    insertNewUnlocks(
      db,
      id,
      unlockedIds.map((achievementExternalId) => ({
        achievementExternalId,
        unlockedAt: new Date('2026-09-20T10:00:00Z'),
        progress: null,
      })),
    )
    const row = db.prepare('SELECT game_id FROM platform_game WHERE id = ?').get(id) as {
      game_id: number
    }
    return { gameId: row.game_id, platformGameId: id }
  }

  const bare = (externalId: string, tier: string): RemoteAchievement =>
    achievement(externalId, { iconUrl: null, iconLockedUrl: null, tier })

  const psn = (externalId: string, tier: string): RemoteAchievement =>
    achievement(externalId, {
      iconUrl: `https://psn/${externalId}.png`,
      iconLockedUrl: `https://psn/${externalId}-locked.png`,
      tier,
    })

  function iconsOf(gameId: number, platform: Platform): (string | null)[] {
    const entry = getGameDetail(db, gameId)?.entries.find((e) => e.platform === platform)
    return entry?.achievements.map((a) => a.iconUrl) ?? []
  }

  it('fills a missing icon from the PlayStation trophy with the same id and tier', () => {
    const shad = seedTrophies('shadps4', 'NPWR1_00', 'Bloodborne', [
      bare('0', 'platinum'),
      bare('1', 'bronze'),
    ])
    seedTrophies('playstation', 'trophy/NPWR1_00', 'Bloodborne', [
      psn('0', 'platinum'),
      psn('1', 'bronze'),
    ])

    expect(iconsOf(shad.gameId, 'shadps4')).toEqual(['https://psn/0.png', 'https://psn/1.png'])
    expect(
      getGameDetail(db, shad.gameId)
        ?.entries.find((e) => e.platform === 'shadps4')
        ?.achievements.map((a) => a.iconLockedUrl),
    ).toEqual(['https://psn/0-locked.png', 'https://psn/1-locked.png'])
  })

  it('keeps an icon the entry already has', () => {
    const shad = seedTrophies('shadps4', 'NPWR1_00', 'Bloodborne', [
      achievement('0', { iconUrl: 'https://own/0.png', tier: 'gold' }),
    ])
    seedTrophies('playstation', 'trophy/NPWR1_00', 'Bloodborne', [psn('0', 'gold')])

    expect(iconsOf(shad.gameId, 'shadps4')).toEqual(['https://own/0.png'])
  })

  it('does not borrow when the tier differs', () => {
    const shad = seedTrophies('shadps4', 'NPWR1_00', 'Bloodborne', [bare('0', 'bronze')])
    seedTrophies('playstation', 'trophy/NPWR1_00', 'Bloodborne', [psn('0', 'gold')])

    expect(iconsOf(shad.gameId, 'shadps4')).toEqual([null])
  })

  it('does not borrow from a non-PlayStation platform', () => {
    const shad = seedTrophies('shadps4', 'NPWR1_00', 'Bloodborne', [bare('0', 'gold')])
    seedTrophies('steam', '1', 'Bloodborne', [achievement('0', { tier: 'gold' })])

    expect(iconsOf(shad.gameId, 'shadps4')).toEqual([null])
  })

  it('does not borrow from an unlinked game', () => {
    const shad = seedTrophies('shadps4', 'NPWR1_00', 'Bloodborne', [bare('0', 'gold')])
    seedTrophies('playstation', 'trophy/NPWR2_00', 'Another Game', [psn('0', 'gold')])

    expect(iconsOf(shad.gameId, 'shadps4')).toEqual([null])
  })

  it('shows the borrowed icon on recent unlocks', () => {
    seedTrophies('shadps4', 'NPWR1_00', 'Bloodborne', [bare('0', 'gold')], ['0'])
    seedTrophies('playstation', 'trophy/NPWR1_00', 'Bloodborne', [psn('0', 'gold')])

    expect(listRecentUnlocks(db, 5)).toEqual([
      expect.objectContaining({ platform: 'shadps4', iconUrl: 'https://psn/0.png' }),
    ])
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

  it('only ever shows nearly-finished games among the ten closest to 100%', () => {
    for (let i = 0; i < 12; i++) {
      seedGame(
        String(i),
        `Game ${i}`,
        12,
        Array.from({ length: 11 - i }, () => null),
      )
    }
    const closestTen = new Set(Array.from({ length: 10 }, (_, i) => `Game ${i}`))

    for (let day = 0; day < 30; day++) {
      const now = new Date(NOW.getTime() + day * DAY)
      const titles = getDashboardStats(db, now).nearlyThere.map((g) => g.title)
      expect(titles).toHaveLength(4)
      for (const title of titles) expect(closestTen.has(title)).toBe(true)
    }
  })

  it('rotates the nearly-there picks daily, but keeps the same four across calls the same day', () => {
    for (let i = 0; i < 12; i++) {
      seedGame(
        String(i),
        `Game ${i}`,
        12,
        Array.from({ length: 11 - i }, () => null),
      )
    }

    const today = getDashboardStats(db, NOW).nearlyThere.map((g) => g.title)
    expect(getDashboardStats(db, NOW).nearlyThere.map((g) => g.title)).toEqual(today)

    const picks = new Set(
      Array.from({ length: 14 }, (_, day) =>
        JSON.stringify(
          getDashboardStats(db, new Date(NOW.getTime() + day * DAY)).nearlyThere.map(
            (g) => g.title,
          ),
        ),
      ),
    )
    expect(picks.size).toBeGreaterThan(1)
  })

  it('counts a linked game once, by its best copy, so other copies never inflate the totals', () => {
    seedGame('1', 'Apex Legends', 2, [null, null])
    seedGame('trophy/NPWR1', 'Apex Legends', 4, [null], 'playstation')
    seedGame('2', 'Portal', 4, [null, null, null])

    expect(getDashboardStats(db, NOW)).toMatchObject({
      unlockedAchievements: 5,
      totalAchievements: 6,
      gamesTracked: 2,
      completedGames: 1,
    })
    expect(getDashboardStats(db, NOW).nearlyThere.map((g) => g.title)).toEqual(['Portal'])
  })

  it('counts a mirrored copy once, however many platforms report it', () => {
    seedGame('1', 'Rainbow Six Siege', 4, [null, null, null])
    seedGame('2', 'Rainbow Six Siege', 4, [null, null, null], 'ubisoft')
    seedGame('trophy/NPWR1', 'Rainbow Six Siege', 5, [null], 'playstation')

    expect(getDashboardStats(db, NOW)).toMatchObject({
      unlockedAchievements: 3,
      totalAchievements: 4,
      gamesTracked: 1,
    })
  })

  it('counts a linked game only on the platform of its best copy', () => {
    seedGame('1', 'Apex Legends', 2, [null, null])
    seedGame('trophy/NPWR1', 'Apex Legends', 4, [null], 'playstation')
    seedGame('trophy/NPWR2', 'Astro Bot', 2, [null], 'playstation')

    expect(getDashboardStats(db, NOW).platforms).toEqual([
      { platform: 'steam', games: 1, unlocked: 2, total: 2 },
      { platform: 'playstation', games: 1, unlocked: 1, total: 2 },
    ])
  })

  it('leaves out a platform whose games are all played further elsewhere', () => {
    seedGame('1', 'Rainbow Six Siege', 4, [null, null, null])
    seedGame('2', 'Rainbow Six Siege', 4, [null], 'ubisoft')

    expect(getDashboardStats(db, NOW).platforms.map((row) => row.platform)).toEqual(['steam'])
  })

  it('makes the platform rows add up to the overall totals', () => {
    seedGame('1', 'Apex Legends', 2, [null, null])
    seedGame('trophy/NPWR1', 'Apex Legends', 4, [null], 'playstation')
    seedGame('2', 'Portal', 4, [null])
    seedGame('trophy/NPWR2', 'Astro Bot', 3, [null, null], 'playstation')

    const stats = getDashboardStats(db, NOW)

    expect(sumOf(stats.platforms, 'unlocked')).toBe(stats.unlockedAchievements)
    expect(sumOf(stats.platforms, 'total')).toBe(stats.totalAchievements)
    expect(sumOf(stats.platforms, 'games')).toBe(stats.gamesTracked)
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

  it('features the rarest unlock, with its game and cover', () => {
    const at = new Date(NOW.getTime() - DAY)
    const { gameId, platformGameId } = seedGame('400', 'Portal', 4, [at])

    expect(getDashboardStats(db, NOW).rarestUnlock).toEqual({
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
      coverUrl: 'https://cover/400.jpg',
    })
  })

  it('only ever features one of the ten rarest unlocks', () => {
    const ids: number[] = []
    for (let i = 0; i < 12; i++) {
      const { platformGameId } = seedGame(String(i), `Game ${i}`, 1, [
        new Date(NOW.getTime() - i * DAY),
      ])
      db.prepare('UPDATE achievement SET global_percent = ? WHERE platform_game_id = ?').run(
        i + 1,
        platformGameId,
      )
      ids.push(platformGameId)
    }
    const tenRarest = new Set(ids.slice(0, 10))

    for (let day = 0; day < 30; day++) {
      const now = new Date(NOW.getTime() + day * DAY)
      const picked = getDashboardStats(db, now).rarestUnlock
      expect(picked).not.toBeNull()
      expect(tenRarest.has(picked!.platformGameId)).toBe(true)
    }
  })

  it('rotates the rarest-unlock spotlight daily, but keeps the same pick across calls the same day', () => {
    for (let i = 0; i < 12; i++) {
      const { platformGameId } = seedGame(String(i), `Game ${i}`, 1, [
        new Date(NOW.getTime() - i * DAY),
      ])
      db.prepare('UPDATE achievement SET global_percent = ? WHERE platform_game_id = ?').run(
        i + 1,
        platformGameId,
      )
    }

    const today = getDashboardStats(db, NOW).rarestUnlock
    expect(getDashboardStats(db, NOW).rarestUnlock).toEqual(today)

    const picks = new Set(
      Array.from(
        { length: 14 },
        (_, day) =>
          getDashboardStats(db, new Date(NOW.getTime() + day * DAY)).rarestUnlock?.platformGameId,
      ),
    )
    expect(picks.size).toBeGreaterThan(1)
  })

  it('features an undated rarest unlock too, and has none before anything is unlocked', () => {
    expect(getDashboardStats(db, NOW).rarestUnlock).toBeNull()

    seedGame('400', 'Portal', 2, [null])

    expect(getDashboardStats(db, NOW).rarestUnlock).toMatchObject({
      name: 'Achievement 400-0',
      unlockedAt: null,
    })
  })

  it('leaves locked achievements and ones with no rarity out of the rarest unlock', () => {
    seedGame('400', 'Portal', 3, [null])
    const { platformGameId } = seedGame('500', 'Unrated', 1, [null], 'ubisoft')
    db.prepare('UPDATE achievement SET global_percent = NULL WHERE platform_game_id = ?').run(
      platformGameId,
    )

    db.prepare("UPDATE achievement SET global_percent = 1 WHERE external_id = '400-2'").run()

    expect(getDashboardStats(db, NOW).rarestUnlock?.name).toBe('Achievement 400-0')
  })

  describe('days', () => {
    const LOCAL_NOW = new Date(2026, 8, 23, 15, 0)
    const at = (daysAgo: number, hour: number) => new Date(2026, 8, 23 - daysAgo, hour, 0)

    it('finds the rarest unlock of the same seven days, ignoring older ones', () => {
      seedGame('1', 'Portal', 4, [at(7, 12), at(3, 12), at(6, 0)])

      expect(getDashboardStats(db, LOCAL_NOW).rarestThisWeek).toBe(20)
    })

    it('has no rarest unlock this week without one', () => {
      seedGame('1', 'Portal', 2, [at(8, 12), null])

      expect(getDashboardStats(db, LOCAL_NOW).rarestThisWeek).toBeNull()
    })

    it('counts unlocks today and on each of the last seven days, oldest first', () => {
      seedGame('1', 'Portal', 8, [
        at(0, 10),
        at(0, 9),
        at(1, 23),
        at(2, 0),
        at(4, 12),
        at(7, 12),
        null,
      ])

      const stats = getDashboardStats(db, LOCAL_NOW)

      expect(stats.unlockedToday).toBe(2)
      expect(stats.unlockedThisWeek).toBe(5)
      expect(stats.week).toEqual([
        { date: new Date(2026, 8, 17), count: 0 },
        { date: new Date(2026, 8, 18), count: 0 },
        { date: new Date(2026, 8, 19), count: 1 },
        { date: new Date(2026, 8, 20), count: 0 },
        { date: new Date(2026, 8, 21), count: 1 },
        { date: new Date(2026, 8, 22), count: 1 },
        { date: new Date(2026, 8, 23), count: 2 },
      ])
    })

    it('counts the days in a row with an unlock, up to today', () => {
      seedGame('1', 'Portal', 5, [at(0, 10), at(1, 10), at(2, 10), at(4, 10)])

      expect(getDashboardStats(db, LOCAL_NOW).streakDays).toBe(3)
    })

    it('keeps the streak alive through today until the day ends', () => {
      seedGame('1', 'Portal', 3, [at(1, 10), at(2, 10)])

      expect(getDashboardStats(db, LOCAL_NOW).streakDays).toBe(2)
    })

    it('has no streak once a whole day passes without an unlock', () => {
      seedGame('1', 'Portal', 2, [at(2, 10), at(3, 10)])

      expect(getDashboardStats(db, LOCAL_NOW).streakDays).toBe(0)
    })

    it('counts an achievement unlocked on two linked copies once, on the day it was first earned', () => {
      seedGame('1', 'Stellar Blade', 3, [at(3, 10), at(0, 10)])
      seedGame('trophy/NPWR1', 'Stellar Blade', 3, [at(0, 11), at(0, 12), at(0, 13)], 'playstation')
      renameAchievement('1-0', 'Drone Hunter')
      renameAchievement('trophy/NPWR1-0', ' drone hunter ')
      renameAchievement('1-1', 'Eve')
      renameAchievement('trophy/NPWR1-1', 'EVE')

      const stats = getDashboardStats(db, LOCAL_NOW)

      expect(stats.unlockedToday).toBe(2)
      expect(stats.unlockedThisWeek).toBe(3)
    })

    it('counts same-named achievements of different games apart', () => {
      seedGame('1', 'Portal', 1, [at(0, 10)])
      seedGame('2', 'Celeste', 1, [at(0, 11)])
      renameAchievement('1-0', 'Welcome')
      renameAchievement('2-0', 'Welcome')

      expect(getDashboardStats(db, LOCAL_NOW).unlockedToday).toBe(2)
    })
  })

  it('counts the unlocks of each rarity, leaving out ones with no rarity', () => {
    const { platformGameId } = seedGame('1', 'Portal', 6, [null, null, null, null, null])
    const percents = [1.5, 5, 9.9, 25, 55, null]
    percents.forEach((percent, i) =>
      db
        .prepare(
          'UPDATE achievement SET global_percent = ? WHERE platform_game_id = ? AND external_id = ?',
        )
        .run(percent, platformGameId, `1-${i}`),
    )
    seedGame('2', 'Unrated', 1, [null], 'ubisoft')
    db.prepare("UPDATE achievement SET global_percent = NULL WHERE external_id = '2-0'").run()

    expect(getDashboardStats(db, NOW).unlockedByRarity).toEqual({
      ultra_rare: 1,
      rare: 2,
      uncommon: 1,
      common: 1,
    })
  })

  it('counts rarities from the copy each game is counted by', () => {
    seedGame('1', 'Apex Legends', 3, [null, null, null])
    seedGame('trophy/NPWR1', 'Apex Legends', 4, [null], 'playstation')

    expect(getDashboardStats(db, NOW).unlockedByRarity).toEqual({
      ultra_rare: 0,
      rare: 0,
      uncommon: 3,
      common: 0,
    })
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
    db.prepare("UPDATE achievement SET global_percent = NULL WHERE external_id = '1-0'").run()
    db.prepare("UPDATE achievement SET global_percent = 1 WHERE external_id = '1-1'").run()
    expect(getDashboardStats(db, NOW).rarestUnlock?.platinum).toBe(true)
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

  it('counts every platinum held on the Dashboard', () => {
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

  it('counts a platinum once per game, however many copies hold one', () => {
    const steam = seedGame('1', 'Astro Bot', 2, [T1, T2])
    makePlatinum(steam.platformGameId, 1, { description: 'Obtained all achievements' })
    const ps = seedGame('trophy/NPWR1', 'Astro Bot', 2, [T1, T2], 'playstation')
    makePlatinum(ps.platformGameId, 1, { tier: 'platinum' })
    seedGame('2', 'Portal', 1, [T1])
    seedGame('3', 'Portal', 1, [T1], 'epic')
    awardPlatinums(db)

    expect(getDashboardStats(db, NOW).platinums).toBe(2)
  })
})
