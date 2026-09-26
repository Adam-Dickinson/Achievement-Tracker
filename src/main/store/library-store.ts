import type { DatabaseSync } from 'node:sqlite'
import type { DashboardStats } from '@shared/dashboard'
import type {
  ActivityPage,
  GameAchievement,
  GameDetail,
  GameEntry,
  LibraryGame,
  RecentUnlock,
} from '@shared/library'
import type { Platform } from '@shared/platform'
import { listArtworkUrls } from './artwork-store'
import { matchKey } from './match-key'

const NEARLY_THERE_COUNT = 4
const RECENT_UNLOCK_COUNT = 6
const WEEK_MS = 7 * 24 * 60 * 60_000
const TRAILING_TAG = /\(([^()]+)\)\s*$/

interface EntryRecord {
  id: number
  game_id: number
  title: string
  platform: Platform
  cover_url: string | null
  total: number
  unlocked: number
  last_unlock: string | null
}

interface RankedEntries {
  readonly best: EntryRecord
  readonly all: readonly EntryRecord[]
}

const ENTRIES = `
  SELECT pg.id, pg.game_id, pg.title, pg.platform, pg.cover_url,
         COUNT(a.id) AS total, COUNT(u.id) AS unlocked, MAX(u.unlocked_at) AS last_unlock
  FROM platform_game pg
  LEFT JOIN achievement a ON a.platform_game_id = pg.id
  LEFT JOIN unlock u ON u.achievement_id = a.id`

export function listLibraryGames(db: DatabaseSync): LibraryGame[] {
  const artwork = listArtworkUrls(db)
  return groupByGame(listEntries(db))
    .map((game) => toLibraryGame(game, artwork))
    .sort(byLatestUnlock)
}

export function getGameDetail(db: DatabaseSync, gameId: number): GameDetail | null {
  const entries = db
    .prepare(`${ENTRIES} WHERE pg.game_id = ? GROUP BY pg.id`)
    .all(gameId) as unknown as EntryRecord[]
  const ranked = rank(entries)
  if (!ranked) return null

  return {
    game: toLibraryGame(ranked, listArtworkUrls(db)),
    entries: ranked.all.map((entry) => toGameEntry(db, entry, ranked.all)),
  }
}

export function getDashboardStats(db: DatabaseSync, now = new Date()): DashboardStats {
  const entries = listEntries(db)
  const artwork = listArtworkUrls(db)
  const games = groupByGame(entries).map((game) => toLibraryGame(game, artwork))
  const nearlyThere = games
    .filter((game) => game.unlocked < game.total)
    .sort((a, b) => b.unlocked / b.total - a.unlocked / a.total || a.title.localeCompare(b.title))
    .slice(0, NEARLY_THERE_COUNT)

  const { count: unlockedThisWeek } = db
    .prepare('SELECT COUNT(*) AS count FROM unlock WHERE unlocked_at >= ?')
    .get(new Date(now.getTime() - WEEK_MS).toISOString()) as { count: number }

  return {
    unlockedAchievements: sum(entries, (entry) => entry.unlocked),
    totalAchievements: sum(entries, (entry) => entry.total),
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
              pg.game_id, pg.id AS platform_game_id, pg.title AS game_title, pg.platform
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
    platform_game_id: number
    game_title: string
    platform: Platform
  }[]

  return rows.map((row) => ({
    achievementId: row.achievement_id,
    gameId: row.game_id,
    platformGameId: row.platform_game_id,
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

function listEntries(db: DatabaseSync): EntryRecord[] {
  return db.prepare(`${ENTRIES} GROUP BY pg.id`).all() as unknown as EntryRecord[]
}

function groupByGame(entries: readonly EntryRecord[]): RankedEntries[] {
  const byGame = new Map<number, EntryRecord[]>()
  for (const entry of entries) {
    const group = byGame.get(entry.game_id)
    if (group) group.push(entry)
    else byGame.set(entry.game_id, [entry])
  }
  return [...byGame.values()].flatMap((group) => rank(group) ?? [])
}

function rank(entries: readonly EntryRecord[]): RankedEntries | null {
  const all = [...entries].sort(
    (a, b) => share(b) - share(a) || b.unlocked - a.unlocked || a.id - b.id,
  )
  const [best] = all
  return best ? { best, all } : null
}

function share(entry: EntryRecord): number {
  return entry.total === 0 ? -1 : entry.unlocked / entry.total
}

function toLibraryGame(
  { best, all }: RankedEntries,
  artwork: ReadonlyMap<string, string>,
): LibraryGame {
  const title = all
    .map((entry) => entry.title.trim())
    .reduce((shortest, candidate) => (candidate.length < shortest.length ? candidate : shortest))
  const lastUnlock = all
    .map((entry) => entry.last_unlock)
    .reduce((latest, candidate) =>
      candidate !== null && (latest === null || candidate > latest) ? candidate : latest,
    )
  return {
    id: best.game_id,
    title,
    platforms: [...new Set(all.map((entry) => entry.platform))],
    coverUrl:
      best.cover_url ??
      all.find((entry) => entry.cover_url !== null)?.cover_url ??
      foundArtwork(all, artwork),
    unlocked: best.unlocked,
    total: best.total,
    lastUnlockAt: toDate(lastUnlock),
  }
}

function foundArtwork(
  entries: readonly EntryRecord[],
  artwork: ReadonlyMap<string, string>,
): string | null {
  for (const entry of entries) {
    const url = artwork.get(matchKey(entry.title))
    if (url) return url
  }
  return null
}

function toGameEntry(db: DatabaseSync, entry: EntryRecord, all: readonly EntryRecord[]): GameEntry {
  const sharesPlatform = all.filter((other) => other.platform === entry.platform).length > 1
  return {
    platformGameId: entry.id,
    platform: entry.platform,
    tag: sharesPlatform ? tagOf(entry.title) : null,
    title: entry.title.trim(),
    unlocked: entry.unlocked,
    total: entry.total,
    achievements: listAchievements(db, entry.id),
  }
}

function tagOf(title: string): string {
  return TRAILING_TAG.exec(title)?.[1]?.trim() ?? title.trim()
}

function listAchievements(db: DatabaseSync, platformGameId: number): GameAchievement[] {
  const rows = db
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

  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    hidden: a.hidden === 1,
    iconUrl: a.icon_url,
    iconLockedUrl: a.icon_locked_url,
    globalPercent: a.global_percent,
    unlocked: a.unlock_id !== null,
    unlockedAt: toDate(a.unlocked_at),
  }))
}

function byLatestUnlock(a: LibraryGame, b: LibraryGame): number {
  const aTime = a.lastUnlockAt?.getTime() ?? -Infinity
  const bTime = b.lastUnlockAt?.getTime() ?? -Infinity
  return bTime - aTime || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

function toDate(iso: string | null): Date | null {
  return iso === null ? null : new Date(iso)
}

function sum<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0)
}
