import type { DatabaseSync } from 'node:sqlite'
import {
  DATA_EXPORT_FORMAT,
  type DataExport,
  type ExportedAccount,
  type ExportedAchievement,
  type ExportedAlias,
  type ExportedEntry,
  type ExportedGame,
} from '@shared/data-export'
import type { Platform } from '@shared/platform'

export interface ExportMeta {
  readonly appVersion: string
  readonly schemaVersion: number
  readonly exportedAt: Date
}

interface AccountRow {
  id: number
  platform: Platform
  display_name: string
  status: string
  last_sync_at: string | null
  created_at: string
}

interface GameRow {
  id: number
  title: string
  release_year: number | null
  cover_url: string | null
}

interface EntryRow {
  id: number
  game_id: number
  account_id: number
  platform: Platform
  title: string
  icon_url: string | null
  cover_url: string | null
  portrait_url: string | null
  hero_url: string | null
  store_url: string | null
  last_played: string | null
  linked: string
  has_platinum: number
  platinum_earned_at: string | null
  platinum_detected_at: string | null
}

interface AchievementRow {
  id: number
  platform_game_id: number
  name: string
  description: string | null
  icon_url: string | null
  icon_locked_url: string | null
  hidden: number
  points: number | null
  tier: string | null
  global_percent: number | null
  has_unlock: number
  unlocked_at: string | null
  detected_at: string | null
  progress_cur: number | null
  progress_max: number | null
}

interface AliasRow {
  match_key: string
  game_id: number
}

interface SettingRow {
  key: string
  value: string
}

export function buildDataExport(db: DatabaseSync, meta: ExportMeta): DataExport {
  return {
    format: DATA_EXPORT_FORMAT,
    exportedAt: meta.exportedAt.toISOString(),
    app: { version: meta.appVersion, schemaVersion: meta.schemaVersion },
    accounts: readAccounts(db),
    games: readGames(db),
    aliases: readAliases(db),
    settings: readSettings(db),
  }
}

function readAccounts(db: DatabaseSync): ExportedAccount[] {
  const rows = db
    .prepare(
      'SELECT id, platform, display_name, status, last_sync_at, created_at FROM account ORDER BY id',
    )
    .all() as unknown as AccountRow[]
  return rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    displayName: row.display_name,
    status: row.status,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
  }))
}

function readGames(db: DatabaseSync): ExportedGame[] {
  const games = db
    .prepare('SELECT id, title, release_year, cover_url FROM game ORDER BY id')
    .all() as unknown as GameRow[]
  const entriesByGame = groupBy(readEntries(db), (entry) => entry.gameId)
  return games.map((game) => ({
    id: game.id,
    title: game.title,
    releaseYear: game.release_year,
    coverUrl: game.cover_url,
    entries: (entriesByGame.get(game.id) ?? []).map(({ entry }) => entry),
  }))
}

function readEntries(db: DatabaseSync): { gameId: number; entry: ExportedEntry }[] {
  const rows = db
    .prepare(
      `SELECT pg.id, pg.game_id, pg.account_id, pg.platform, pg.title, pg.icon_url, pg.cover_url,
              pg.portrait_url, pg.hero_url, pg.store_url, pg.last_played, pg.linked,
              (p.platform_game_id IS NOT NULL) AS has_platinum,
              p.earned_at AS platinum_earned_at, p.detected_at AS platinum_detected_at
       FROM platform_game pg
       LEFT JOIN platinum p ON p.platform_game_id = pg.id
       ORDER BY pg.id`,
    )
    .all() as unknown as EntryRow[]
  const achievements = groupBy(readAchievements(db), (achievement) => achievement.platformGameId)
  return rows.map((row) => ({
    gameId: row.game_id,
    entry: {
      id: row.id,
      accountId: row.account_id,
      platform: row.platform,
      title: row.title,
      iconUrl: row.icon_url,
      coverUrl: row.cover_url,
      portraitUrl: row.portrait_url,
      heroUrl: row.hero_url,
      storeUrl: row.store_url,
      lastPlayed: row.last_played,
      linked: row.linked,
      platinum: row.has_platinum
        ? { earnedAt: row.platinum_earned_at, detectedAt: row.platinum_detected_at ?? '' }
        : null,
      achievements: (achievements.get(row.id) ?? []).map(({ achievement }) => achievement),
    },
  }))
}

function readAchievements(
  db: DatabaseSync,
): { platformGameId: number; achievement: ExportedAchievement }[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.platform_game_id, a.name, a.description, a.icon_url, a.icon_locked_url,
              a.hidden, a.points, a.tier, a.global_percent,
              (u.id IS NOT NULL) AS has_unlock, u.unlocked_at, u.detected_at,
              u.progress_cur, u.progress_max
       FROM achievement a
       LEFT JOIN unlock u ON u.achievement_id = a.id
       ORDER BY a.id`,
    )
    .all() as unknown as AchievementRow[]
  return rows.map((row) => ({
    platformGameId: row.platform_game_id,
    achievement: {
      id: row.id,
      name: row.name,
      description: row.description,
      iconUrl: row.icon_url,
      iconLockedUrl: row.icon_locked_url,
      hidden: row.hidden === 1,
      points: row.points,
      tier: row.tier,
      globalPercent: row.global_percent,
      unlock: row.has_unlock
        ? {
            unlockedAt: row.unlocked_at,
            detectedAt: row.detected_at ?? '',
            progressCurrent: row.progress_cur,
            progressMax: row.progress_max,
          }
        : null,
    },
  }))
}

function readAliases(db: DatabaseSync): ExportedAlias[] {
  const rows = db
    .prepare('SELECT match_key, game_id FROM game_alias ORDER BY match_key')
    .all() as unknown as AliasRow[]
  return rows.map((row) => ({ matchKey: row.match_key, gameId: row.game_id }))
}

function readSettings(db: DatabaseSync): Record<string, unknown> {
  const rows = db
    .prepare('SELECT key, value FROM setting ORDER BY key')
    .all() as unknown as SettingRow[]
  return Object.fromEntries(rows.map((row) => [row.key, parseValue(row.value)]))
}

function parseValue(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const group = groups.get(key(item))
    if (group) group.push(item)
    else groups.set(key(item), [item])
  }
  return groups
}
