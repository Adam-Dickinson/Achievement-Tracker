import type { DatabaseSync } from 'node:sqlite'
import type { DashboardStats } from '@shared/dashboard'
import type {
  ActivityPage,
  GameAchievement,
  GameDetail,
  LibraryGame,
  RecentUnlock,
} from '@shared/library'
import type { Platform } from '@shared/platform'

const NEARLY_THERE_COUNT = 4
const RECENT_UNLOCK_COUNT = 6
const WEEK_MS = 7 * 24 * 60 * 60_000

interface LibraryGameRecord {
  id: number
  title: string
  platform: Platform
  cover_url: string | null
  total: number
  unlocked: number
  last_unlock: string | null
}

const LIBRARY_GAMES = `
  SELECT pg.id, pg.title, pg.platform, g.cover_url,
         COUNT(a.id) AS total, COUNT(u.id) AS unlocked, MAX(u.unlocked_at) AS last_unlock
  FROM platform_game pg
  JOIN game g ON g.id = pg.game_id
  LEFT JOIN achievement a ON a.platform_game_id = pg.id
  LEFT JOIN unlock u ON u.achievement_id = a.id`

export function listLibraryGames(db: DatabaseSync): LibraryGame[] {
  const rows = db
    .prepare(
      `${LIBRARY_GAMES}
       GROUP BY pg.id
       ORDER BY last_unlock DESC, pg.title COLLATE NOCASE`,
    )
    .all() as unknown as LibraryGameRecord[]
  return rows.map(toLibraryGame)
}

export function getGameDetail(db: DatabaseSync, platformGameId: number): GameDetail | null {
  const row = db.prepare(`${LIBRARY_GAMES} WHERE pg.id = ? GROUP BY pg.id`).get(platformGameId) as
    LibraryGameRecord | undefined
  if (!row) return null

  const achievements = db
    .prepare(
      `SELECT a.id, a.name, a.description, a.hidden, a.icon_url, a.icon_locked_url,
              a.global_percent, u.id AS unlock_id, u.unlocked_at
       FROM achievement a
       LEFT JOIN unlock u ON u.achievement_id = a.id
       WHERE a.platform_game_id = ?
       ORDER BY a.id`,
    )
    .all(platformGameId) as unknown as {
    id: number
    name: string
    description: string | null
    hidden: number
    icon_url: string | null
    icon_locked_url: string | null
    global_percent: number | null
    unlock_id: number | null
    unlocked_at: string | null
  }[]

  return {
    game: toLibraryGame(row),
    achievements: achievements.map((a): GameAchievement => ({
      id: a.id,
      name: a.name,
      description: a.description,
      hidden: a.hidden === 1,
      iconUrl: a.icon_url,
      iconLockedUrl: a.icon_locked_url,
      globalPercent: a.global_percent,
      unlocked: a.unlock_id !== null,
      unlockedAt: toDate(a.unlocked_at),
    })),
  }
}

export function getDashboardStats(db: DatabaseSync, now = new Date()): DashboardStats {
  const games = listLibraryGames(db)
  const unfinished = games.filter((game) => game.unlocked < game.total)
  const nearlyThere = unfinished
    .sort((a, b) => b.unlocked / b.total - a.unlocked / a.total || a.title.localeCompare(b.title))
    .slice(0, NEARLY_THERE_COUNT)

  const { count: unlockedThisWeek } = db
    .prepare('SELECT COUNT(*) AS count FROM unlock WHERE unlocked_at >= ?')
    .get(new Date(now.getTime() - WEEK_MS).toISOString()) as { count: number }

  return {
    unlockedAchievements: sum(games, (game) => game.unlocked),
    totalAchievements: sum(games, (game) => game.total),
    gamesTracked: games.length,
    completedGames: games.filter((game) => game.total > 0 && game.unlocked === game.total).length,
    unlockedThisWeek,
    nearlyThere,
    recentUnlocks: listRecentUnlocks(db, RECENT_UNLOCK_COUNT),
  }
}

export function listRecentUnlocks(db: DatabaseSync, limit: number): RecentUnlock[] {
  const rows = db
    .prepare(
      `SELECT a.id AS achievement_id, a.name, a.description, a.icon_url, a.global_percent,
              u.unlocked_at,
              pg.id AS game_id, pg.title AS game_title, pg.platform
       FROM unlock u
       JOIN achievement a ON a.id = u.achievement_id
       JOIN platform_game pg ON pg.id = a.platform_game_id
       WHERE u.unlocked_at IS NOT NULL
       ORDER BY u.unlocked_at DESC, a.id DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as {
    achievement_id: number
    name: string
    description: string | null
    icon_url: string | null
    global_percent: number | null
    unlocked_at: string
    game_id: number
    game_title: string
    platform: Platform
  }[]

  return rows.map((row) => ({
    achievementId: row.achievement_id,
    gameId: row.game_id,
    gameTitle: row.game_title,
    platform: row.platform,
    name: row.name,
    description: row.description,
    iconUrl: row.icon_url,
    globalPercent: row.global_percent,
    unlockedAt: new Date(row.unlocked_at),
  }))
}

export function listActivity(db: DatabaseSync, limit: number): ActivityPage {
  const unlocks = listRecentUnlocks(db, limit + 1)
  return { unlocks: unlocks.slice(0, limit), hasMore: unlocks.length > limit }
}

function toLibraryGame(row: LibraryGameRecord): LibraryGame {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    coverUrl: row.cover_url,
    unlocked: row.unlocked,
    total: row.total,
    lastUnlockAt: toDate(row.last_unlock),
  }
}

function toDate(iso: string | null): Date | null {
  return iso === null ? null : new Date(iso)
}

function sum<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0)
}
