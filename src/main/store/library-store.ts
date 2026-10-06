import type { DatabaseSync } from 'node:sqlite'
import type { DashboardStats, PlatformProgress, RarestUnlock } from '@shared/dashboard'
import type {
  ActivityItem,
  ActivityPage,
  AppPlatinum,
  GameAchievement,
  GameDetail,
  GameEntry,
  LibraryGame,
  RecentPlatinum,
  RecentUnlock,
  UnlockedAchievement,
} from '@shared/library'
import type { KnownGame } from '@shared/launch'
import { PLATFORMS, type Platform } from '@shared/platform'
import { type Rarity, rarityFromPercent } from '@shared/rarity'
import { listArtworkUrls } from './artwork-store'
import { dayStats } from './day-stats'
import { matchKey } from './match-key'
import { isPlatinumAchievement } from './platinum'
import { dayKey, seededPick } from './seeded-pick'

const NEARLY_THERE_COUNT = 4
const NEARLY_THERE_POOL = 10
const RAREST_UNLOCK_POOL = 10
const RECENT_UNLOCK_COUNT = 6
const TRAILING_TAG = /\(([^()]+)\)\s*$/

interface EntryRecord {
  id: number
  game_id: number
  title: string
  platform: Platform
  cover_url: string | null
  store_url: string | null
  portrait_url: string | null
  hero_url: string | null
  playtime_seconds: number | null
  total: number
  unlocked: number
  last_unlock: string | null
}

interface RankedEntries {
  readonly best: EntryRecord
  readonly all: readonly EntryRecord[]
}

interface UnlockRecord {
  achievement_id: number
  name: string
  description: string | null
  tier: string | null
  icon_url: string | null
  global_percent: number | null
  unlocked_at: string | null
  game_id: number
  platform_game_id: number
  game_title: string
  platform: Platform
}

function sharedPlayStationIcon(column: 'icon_url' | 'icon_locked_url'): string {
  return `(SELECT b.${column}
           FROM achievement b
           JOIN platform_game bp ON bp.id = b.platform_game_id
           WHERE bp.game_id = pg.game_id
             AND bp.platform = 'playstation'
             AND b.external_id = a.external_id
             AND b.tier IS a.tier
             AND b.${column} IS NOT NULL
           ORDER BY b.id
           LIMIT 1)`
}

const ICON = `COALESCE(a.icon_url, ${sharedPlayStationIcon('icon_url')})`
const LOCKED_ICON = `COALESCE(a.icon_locked_url, ${sharedPlayStationIcon('icon_locked_url')})`

const UNLOCKS = `
  SELECT a.id AS achievement_id, a.name, a.description, a.tier, ${ICON} AS icon_url,
         a.global_percent,
         u.unlocked_at,
         pg.game_id, pg.id AS platform_game_id, pg.title AS game_title, pg.platform
  FROM unlock u
  JOIN achievement a ON a.id = u.achievement_id
  JOIN platform_game pg ON pg.id = a.platform_game_id`

const ENTRIES = `
  SELECT pg.id, pg.game_id, pg.title, pg.platform, pg.cover_url, pg.store_url,
         pg.portrait_url, pg.hero_url, pg.playtime_seconds,
         COUNT(a.id) AS total, COUNT(u.id) AS unlocked, MAX(u.unlocked_at) AS last_unlock
  FROM platform_game pg
  LEFT JOIN achievement a ON a.platform_game_id = pg.id
  LEFT JOIN unlock u ON u.achievement_id = a.id`

export function storePageUrl(db: DatabaseSync, platformGameId: number): string | null {
  const row = db.prepare('SELECT store_url FROM platform_game WHERE id = ?').get(platformGameId) as
    { store_url: string | null } | undefined
  return row?.store_url ?? null
}

export function listKnownGames(db: DatabaseSync): KnownGame[] {
  const rows = db
    .prepare('SELECT id, game_id, platform, external_id, title FROM platform_game ORDER BY id')
    .all() as unknown as {
    id: number
    game_id: number
    platform: Platform
    external_id: string
    title: string
  }[]
  return rows.map((row) => ({
    id: row.id,
    gameId: row.game_id,
    platform: row.platform,
    externalId: row.external_id,
    title: row.title,
  }))
}

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

  const appPlatinums = new Map(
    listAppPlatinums(db).map((platinum) => [platinum.platformGameId, platinum]),
  )
  return {
    game: toLibraryGame(ranked, listArtworkUrls(db)),
    entries: ranked.all.map((entry) =>
      toGameEntry(db, entry, ranked.all, appPlatinums.get(entry.id) ?? null),
    ),
  }
}

export function getDashboardStats(db: DatabaseSync, now = new Date()): DashboardStats {
  const entries = listEntries(db)
  const artwork = listArtworkUrls(db)
  const ranked = groupByGame(entries)
  const games = ranked.map((game) => toLibraryGame(game, artwork))
  const counted = ranked.map((game) => game.best)
  const nearlyThereCandidates = games
    .filter((game) => game.unlocked < game.total)
    .sort((a, b) => b.unlocked / b.total - a.unlocked / a.total || a.title.localeCompare(b.title))
    .slice(0, NEARLY_THERE_POOL)
  const nearlyThere = seededPick(
    nearlyThereCandidates,
    NEARLY_THERE_COUNT,
    `${dayKey(now)}:nearly-there`,
  )

  const days = dayStats(listUnlockTimes(db), now)

  return {
    unlockedAchievements: sum(counted, (entry) => entry.unlocked),
    totalAchievements: sum(counted, (entry) => entry.total),
    gamesTracked: games.length,
    completedGames: games.filter((game) => game.total > 0 && game.unlocked === game.total).length,
    unlockedToday: days.today,
    unlockedThisWeek: sum(days.week, (day) => day.count),
    streakDays: days.streak,
    week: days.week,
    unlockedByRarity: countByRarity(db, new Set(counted.map((entry) => entry.id))),
    platinums: countPlatinums(db, entries),
    platforms: byPlatform(counted),
    nearlyThere,
    recentUnlocks: listRecentUnlocks(db, RECENT_UNLOCK_COUNT),
    rarestUnlock: findRarestUnlock(db, games, now),
    rarestThisWeek: rarestSince(db, days.week[0]?.date ?? now),
  }
}

function rarestSince(db: DatabaseSync, since: Date): number | null {
  const row = db
    .prepare(
      `SELECT MIN(a.global_percent) AS percent FROM unlock u
       JOIN achievement a ON a.id = u.achievement_id
       WHERE u.unlocked_at >= ? AND a.global_percent IS NOT NULL`,
    )
    .get(since.toISOString()) as { percent: number | null }
  return row.percent
}

function listUnlockTimes(db: DatabaseSync): Date[] {
  const rows = db
    .prepare(
      `SELECT MIN(u.unlocked_at) AS unlocked_at FROM unlock u
       JOIN achievement a ON a.id = u.achievement_id
       JOIN platform_game pg ON pg.id = a.platform_game_id
       WHERE u.unlocked_at IS NOT NULL
       GROUP BY pg.game_id, LOWER(TRIM(a.name))`,
    )
    .all() as unknown as { unlocked_at: string }[]
  return rows.map((row) => new Date(row.unlocked_at))
}

function countByRarity(
  db: DatabaseSync,
  countedEntries: ReadonlySet<number>,
): Record<Rarity, number> {
  const rows = db
    .prepare(
      `SELECT a.platform_game_id, a.global_percent FROM unlock u
       JOIN achievement a ON a.id = u.achievement_id
       WHERE a.global_percent IS NOT NULL`,
    )
    .all() as unknown as { platform_game_id: number; global_percent: number }[]
  const counts: Record<Rarity, number> = { ultra_rare: 0, rare: 0, uncommon: 0, common: 0 }
  for (const row of rows) {
    if (countedEntries.has(row.platform_game_id)) counts[rarityFromPercent(row.global_percent)]++
  }
  return counts
}

export function listRecentUnlocks(db: DatabaseSync, limit: number): RecentUnlock[] {
  const rows = db
    .prepare(
      `${UNLOCKS}
       WHERE u.unlocked_at IS NOT NULL
       ORDER BY u.unlocked_at DESC, a.id DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as (UnlockRecord & { unlocked_at: string })[]
  return rows.map((row) => ({
    ...toUnlock(row),
    kind: 'achievement',
    unlockedAt: new Date(row.unlocked_at),
  }))
}

function findRarestUnlock(
  db: DatabaseSync,
  games: readonly LibraryGame[],
  now: Date,
): RarestUnlock | null {
  const candidates = db
    .prepare(
      `${UNLOCKS}
       WHERE a.global_percent IS NOT NULL
       ORDER BY a.global_percent, u.unlocked_at DESC, a.id DESC
       LIMIT ?`,
    )
    .all(RAREST_UNLOCK_POOL) as unknown as UnlockRecord[]
  const [picked] = seededPick(candidates, 1, `${dayKey(now)}:rarest-unlock`)
  if (!picked) return null
  const coverUrl = games.find((game) => game.id === picked.game_id)?.coverUrl ?? null
  return { ...toUnlock(picked), coverUrl }
}

export function listActivity(db: DatabaseSync, limit: number): ActivityPage {
  const platinums = listAppPlatinums(db).flatMap((platinum): RecentPlatinum[] =>
    platinum.earnedAt === null
      ? []
      : [
          {
            kind: 'platinum',
            gameId: platinum.gameId,
            platformGameId: platinum.platformGameId,
            gameTitle: platinum.gameTitle,
            platform: platinum.platform,
            unlockedAt: platinum.earnedAt,
          },
        ],
  )
  const items: ActivityItem[] = [...platinums, ...listRecentUnlocks(db, limit + 1)]
    .sort((a, b) => b.unlockedAt.getTime() - a.unlockedAt.getTime() || kindOrder(a) - kindOrder(b))
    .slice(0, limit + 1)
  return { unlocks: items.slice(0, limit), hasMore: items.length > limit }
}

function kindOrder(item: ActivityItem): number {
  return item.kind === 'platinum' ? 0 : 1
}

interface AppPlatinumRecord extends AppPlatinum {
  readonly gameId: number
  readonly platformGameId: number
  readonly gameTitle: string
  readonly platform: Platform
}

function listAppPlatinums(db: DatabaseSync): AppPlatinumRecord[] {
  const rows = db
    .prepare(
      `SELECT p.platform_game_id, p.earned_at, pg.game_id, pg.title, pg.platform
       FROM platinum p
       JOIN platform_game pg ON pg.id = p.platform_game_id`,
    )
    .all() as unknown as {
    platform_game_id: number
    earned_at: string | null
    game_id: number
    title: string
    platform: Platform
  }[]
  const withOwn = entriesWithOwnPlatinum(db, 'awarded')
  return rows
    .filter((row) => !withOwn.has(row.platform_game_id))
    .map((row) => ({
      gameId: row.game_id,
      platformGameId: row.platform_game_id,
      gameTitle: row.title,
      platform: row.platform,
      earnedAt: toDate(row.earned_at),
    }))
}

const OWN_PLATINUM_SCOPE: Record<'unlocked' | 'awarded', string> = {
  unlocked: 'JOIN unlock u ON u.achievement_id = a.id',
  awarded: 'JOIN platinum p ON p.platform_game_id = a.platform_game_id',
}

function entriesWithOwnPlatinum(db: DatabaseSync, among: 'unlocked' | 'awarded'): Set<number> {
  const rows = db
    .prepare(
      `SELECT a.platform_game_id, a.tier, a.description, pg.title
       FROM achievement a
       JOIN platform_game pg ON pg.id = a.platform_game_id
       ${OWN_PLATINUM_SCOPE[among]}
       WHERE (a.tier IS NOT NULL OR a.description IS NOT NULL)`,
    )
    .all() as unknown as {
    platform_game_id: number
    tier: string | null
    description: string | null
    title: string
  }[]
  return new Set(
    rows.filter((row) => isPlatinumAchievement(row, row.title)).map((row) => row.platform_game_id),
  )
}

function countPlatinums(db: DatabaseSync, entries: readonly EntryRecord[]): number {
  const gameOf = new Map(entries.map((entry) => [entry.id, entry.game_id]))
  const games = new Set(listAppPlatinums(db).map((platinum) => platinum.gameId))
  for (const entryId of entriesWithOwnPlatinum(db, 'unlocked')) {
    const gameId = gameOf.get(entryId)
    if (gameId !== undefined) games.add(gameId)
  }
  return games.size
}

function toUnlock(row: UnlockRecord): UnlockedAchievement {
  return {
    achievementId: row.achievement_id,
    gameId: row.game_id,
    platformGameId: row.platform_game_id,
    gameTitle: row.game_title,
    platform: row.platform,
    name: row.name,
    description: row.description,
    iconUrl: row.icon_url,
    globalPercent: row.global_percent,
    platinum: isPlatinumAchievement(row, row.game_title),
    unlockedAt: toDate(row.unlocked_at),
  }
}

function byPlatform(entries: readonly EntryRecord[]): PlatformProgress[] {
  return PLATFORMS.flatMap((platform) => {
    const own = entries.filter((entry) => entry.platform === platform)
    if (own.length === 0) return []
    return [
      {
        platform,
        games: own.length,
        unlocked: sum(own, (entry) => entry.unlocked),
        total: sum(own, (entry) => entry.total),
      },
    ]
  }).sort((a, b) => b.unlocked - a.unlocked)
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
    portraitUrl:
      best.portrait_url ?? all.find((entry) => entry.portrait_url !== null)?.portrait_url ?? null,
    heroUrl: best.hero_url ?? all.find((entry) => entry.hero_url !== null)?.hero_url ?? null,
    unlocked: best.unlocked,
    total: best.total,
    lastUnlockAt: toDate(lastUnlock),
    ...totalPlaytime(all),
  }
}

function totalPlaytime(entries: readonly EntryRecord[]): {
  playtimeSeconds: number | null
  playtimePartial: boolean
} {
  const reported = entries.flatMap((entry) =>
    entry.playtime_seconds === null ? [] : [entry.playtime_seconds],
  )
  return {
    playtimeSeconds: reported.length === 0 ? null : reported.reduce((a, b) => a + b, 0),
    playtimePartial: reported.length > 0 && reported.length < entries.length,
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

function toGameEntry(
  db: DatabaseSync,
  entry: EntryRecord,
  all: readonly EntryRecord[],
  appPlatinum: AppPlatinum | null,
): GameEntry {
  const sharesPlatform = all.filter((other) => other.platform === entry.platform).length > 1
  return {
    platformGameId: entry.id,
    platform: entry.platform,
    tag: sharesPlatform ? tagOf(entry.title) : null,
    title: entry.title.trim(),
    unlocked: entry.unlocked,
    total: entry.total,
    achievements: listAchievements(db, entry.id, entry.title),
    appPlatinum: appPlatinum && { earnedAt: appPlatinum.earnedAt },
    hasStorePage: entry.store_url !== null,
    playtimeSeconds: entry.playtime_seconds,
  }
}

function tagOf(title: string): string {
  return TRAILING_TAG.exec(title)?.[1]?.trim() ?? title.trim()
}

function listAchievements(
  db: DatabaseSync,
  platformGameId: number,
  gameTitle: string,
): GameAchievement[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.name, a.description, a.tier, a.hidden,
              ${ICON} AS icon_url, ${LOCKED_ICON} AS icon_locked_url,
              a.global_percent, u.id AS unlock_id, u.unlocked_at
       FROM achievement a
       JOIN platform_game pg ON pg.id = a.platform_game_id
       LEFT JOIN unlock u ON u.achievement_id = a.id
       WHERE a.platform_game_id = ?
       ORDER BY a.id`,
    )
    .all(platformGameId) as unknown as {
    id: number
    name: string
    description: string | null
    tier: string | null
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
    platinum: isPlatinumAchievement(a, gameTitle),
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
