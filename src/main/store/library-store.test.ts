import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RemoteAchievement, RemoteGame } from '@shared/models'
import {
  getDashboardStats,
  getGameDetail,
  listActivity,
  listLibraryGames,
  listRecentUnlocks,
} from './library-store'
import { applyMigrations } from './migrate'
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

function seedGame(
  externalId: string,
  title: string,
  total: number,
  unlockedAt: readonly (Date | null)[] = [],
): number {
  const account = upsertAccount(db, { platform: 'steam', externalId: 'acc', displayName: 'Player' })
  addPlatformGames(db, account, [game(externalId, title)])
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
  return id
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  applyMigrations(db)
})

describe('listLibraryGames', () => {
  it('lists each game with its cover, achievement counts and last unlock', () => {
    const id = seedGame('400', 'Portal', 3, [
      new Date('2026-09-01T10:00:00Z'),
      new Date('2026-09-05T10:00:00Z'),
    ])

    expect(listLibraryGames(db)).toEqual([
      {
        id,
        title: 'Portal',
        platform: 'steam',
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
})

describe('getGameDetail', () => {
  it('returns the game and every achievement with its unlock state', () => {
    const id = seedGame('400', 'Portal', 2, [new Date('2026-09-01T10:00:00Z')])

    const detail = getGameDetail(db, id)

    expect(detail?.game).toMatchObject({ id, title: 'Portal', unlocked: 1, total: 2 })
    expect(detail?.achievements).toEqual([
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
    const id = seedGame('400', 'Portal', 1, [null])

    expect(getGameDetail(db, id)?.achievements[0]).toMatchObject({
      unlocked: true,
      unlockedAt: null,
    })
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
      gameId: portal,
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

    expect(page.unlocks.map((u) => u.name)).toEqual(['Achievement 400-2', 'Achievement 400-1'])
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
})
