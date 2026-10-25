import type { DatabaseSync } from 'node:sqlite'
import type { ReplayTarget } from '@shared/ipc'
import type { UnlockEvent } from '@shared/models'
import type { Platform } from '@shared/platform'
import { appPlatinumAchievement } from './platinum'

interface UnlockedRecord {
  external_id: string
  name: string
  description: string | null
  icon_url: string | null
  icon_locked_url: string | null
  hidden: number
  points: number | null
  tier: string | null
  global_percent: number | null
  unlocked_at: string | null
  detected_at: string
  game_title: string
  platform: Platform
}

interface PlatinumRecord {
  earned_at: string | null
  detected_at: string
  game_title: string
  platform: Platform
}

export function findReplayEvent(db: DatabaseSync, target: ReplayTarget): UnlockEvent | null {
  return target.kind === 'achievement'
    ? findUnlockedAchievement(db, target.achievementId)
    : findPlatinum(db, target.platformGameId)
}

function findUnlockedAchievement(db: DatabaseSync, achievementId: number): UnlockEvent | null {
  const row = db
    .prepare(
      `SELECT a.external_id, a.name, a.description, a.icon_url, a.icon_locked_url, a.hidden,
              a.points, a.tier, a.global_percent, u.unlocked_at, u.detected_at,
              pg.title AS game_title, pg.platform
       FROM achievement a
       JOIN unlock u ON u.achievement_id = a.id
       JOIN platform_game pg ON pg.id = a.platform_game_id
       WHERE a.id = ?`,
    )
    .get(achievementId) as UnlockedRecord | undefined
  if (!row) return null
  return {
    platform: row.platform,
    gameTitle: row.game_title,
    achievement: {
      externalId: row.external_id,
      name: row.name,
      description: row.description,
      iconUrl: row.icon_url,
      iconLockedUrl: row.icon_locked_url,
      hidden: row.hidden !== 0,
      points: row.points,
      tier: row.tier,
      globalPercent: row.global_percent,
    },
    unlockedAt: toDate(row.unlocked_at),
    detectedAt: new Date(row.detected_at),
  }
}

function findPlatinum(db: DatabaseSync, platformGameId: number): UnlockEvent | null {
  const row = db
    .prepare(
      `SELECT p.earned_at, p.detected_at, pg.title AS game_title, pg.platform
       FROM platinum p
       JOIN platform_game pg ON pg.id = p.platform_game_id
       WHERE p.platform_game_id = ?`,
    )
    .get(platformGameId) as PlatinumRecord | undefined
  if (!row) return null
  return {
    platform: row.platform,
    gameTitle: row.game_title,
    achievement: appPlatinumAchievement(row.game_title),
    unlockedAt: toDate(row.earned_at),
    detectedAt: new Date(row.detected_at),
  }
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value)
}
