import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RemoteAchievement, RemoteGame } from '@shared/models'
import { getDashboardStats, listActivity, listLibraryGames } from './library-store'
import { applyMigrations } from './migrate'
import {
  addPlatformGames,
  getPlatformGameByExternalId,
  insertNewUnlocks,
  upsertAccount,
  upsertAchievements,
} from './sync-store'

const GAME_COUNT = 5_000
const ACHIEVEMENTS_PER_GAME = 40
const UNLOCKED_PER_GAME = 12
const BUDGET_MS = 2_000
const DAY = 24 * 60 * 60_000
const START = Date.parse('2025-01-01T00:00:00.000Z')

function remoteGame(index: number): RemoteGame {
  return {
    ref: { externalId: `game-${index}` },
    title: `Game ${index}`,
    iconUrl: null,
    coverUrl: `https://cover/${index}.jpg`,
    lastPlayed: null,
    recentlyPlayed: false,
  }
}

function remoteAchievement(game: number, index: number): RemoteAchievement {
  return {
    externalId: `${game}-${index}`,
    name: `Achievement ${game}-${index}`,
    description: `Do ${index}`,
    iconUrl: `https://icon/${game}-${index}.jpg`,
    iconLockedUrl: null,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: (index * 2.5) % 100,
  }
}

function seed(db: DatabaseSync): void {
  const account = upsertAccount(db, { platform: 'steam', externalId: 'large', displayName: 'Big' })
  db.exec('BEGIN')
  addPlatformGames(
    db,
    account,
    Array.from({ length: GAME_COUNT }, (_, index) => remoteGame(index)),
  )
  for (let game = 0; game < GAME_COUNT; game++) {
    const { id } = getPlatformGameByExternalId(db, account.id, `game-${game}`)
    upsertAchievements(
      db,
      id,
      Array.from({ length: ACHIEVEMENTS_PER_GAME }, (_, index) => remoteAchievement(game, index)),
    )
    insertNewUnlocks(
      db,
      id,
      Array.from({ length: UNLOCKED_PER_GAME }, (_, index) => ({
        achievementExternalId: `${game}-${index}`,
        unlockedAt: new Date(START + ((game * UNLOCKED_PER_GAME + index) % 600) * DAY),
        progress: null,
      })),
    )
  }
  db.exec('COMMIT')
}

function timed<T>(label: string, run: () => T): { result: T; ms: number } {
  const started = performance.now()
  const result = run()
  const ms = performance.now() - started
  console.info(`${label}: ${ms.toFixed(1)} ms`)
  return { result, ms }
}

describe.skipIf(process.env.TL_LARGE !== '1')('a 5,000 game, 200,000 achievement library', () => {
  let db: DatabaseSync

  beforeAll(() => {
    db = new DatabaseSync(':memory:')
    applyMigrations(db)
    timed('seed', () => seed(db))
  }, 120_000)

  afterAll(() => db.close())

  it('holds the expected number of rows', () => {
    const count = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
    expect(count('platform_game')).toBe(GAME_COUNT)
    expect(count('achievement')).toBe(GAME_COUNT * ACHIEVEMENTS_PER_GAME)
    expect(count('unlock')).toBe(GAME_COUNT * UNLOCKED_PER_GAME)
  })

  it('lists the library inside the budget', () => {
    const { result, ms } = timed('listLibraryGames', () => listLibraryGames(db))
    expect(result).toHaveLength(GAME_COUNT)
    expect(ms).toBeLessThan(BUDGET_MS)
  }, 120_000)

  it('builds the dashboard inside the budget', () => {
    const { ms } = timed('getDashboardStats', () => getDashboardStats(db))
    expect(ms).toBeLessThan(BUDGET_MS)
  }, 120_000)

  it('pages the activity feed inside the budget', () => {
    const { result, ms } = timed('listActivity', () => listActivity(db, 50))
    expect(result.unlocks).toHaveLength(50)
    expect(ms).toBeLessThan(BUDGET_MS)
  }, 120_000)
})
