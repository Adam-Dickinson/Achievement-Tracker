import type { DatabaseSync } from 'node:sqlite'
import type { RemoteAchievement } from '@shared/models'
import { foldAccents } from '@shared/text'

export const APP_PLATINUM_ID = 'trophy-locker:platinum'

const MAX_DESCRIPTION = 90
const MAX_WORDS_BETWEEN = 4
const EVERYTHING = new Set(['all', 'every'])
const ACHIEVEMENT_WORDS = new Set(['achievement', 'achievements', 'trophy', 'trophies'])
const FILLER = new Set([
  'the',
  'other',
  'of',
  'your',
  'base',
  'main',
  'game',
  'regular',
  'story',
  'remaining',
])
const WORDS_AFTER = new Set([
  'in',
  'for',
  'of',
  'and',
  'from',
  'obtained',
  'completed',
  'have',
  'unlocked',
  'earned',
  'collected',
])

export interface PlatinumCandidate {
  readonly tier: string | null
  readonly description: string | null
}

export function isPlatinumAchievement(achievement: PlatinumCandidate, gameTitle: string): boolean {
  if (achievement.tier !== null) return achievement.tier === 'platinum'
  const { description } = achievement
  if (description === null || description.trim().length > MAX_DESCRIPTION) return false

  const words = wordsOf(description)
  const titleWords = new Set(wordsOf(gameTitle))
  return words.some((word, start) => {
    if (!EVERYTHING.has(word)) return false
    const end = words.findIndex(
      (candidate, index) => index > start && ACHIEVEMENT_WORDS.has(candidate),
    )
    if (end < 0 || end - start - 1 > MAX_WORDS_BETWEEN) return false
    const between = words.slice(start + 1, end)
    const after = words[end + 1]
    return (
      between.every((w) => FILLER.has(w) || titleWords.has(w)) &&
      (after === undefined || WORDS_AFTER.has(after))
    )
  })
}

function wordsOf(text: string): string[] {
  return (
    foldAccents(text.replace(/[®™©]/g, ' '))
      .toLowerCase()
      .match(/[\p{L}\p{N}'’]+/gu) ?? []
  )
}

export function appPlatinumAchievement(gameTitle: string): RemoteAchievement {
  return {
    externalId: APP_PLATINUM_ID,
    name: 'Platinum',
    description: `Every achievement in ${gameTitle}`,
    iconUrl: null,
    iconLockedUrl: null,
    hidden: false,
    points: null,
    tier: 'platinum',
    globalPercent: null,
  }
}

export interface AwardedPlatinum {
  readonly earnedAt: Date | null
}

export function awardPlatinum(
  db: DatabaseSync,
  platformGameId: number,
  detectedAt = new Date(),
): AwardedPlatinum | null {
  const entry = db
    .prepare(
      `SELECT pg.title, EXISTS(SELECT 1 FROM platinum p WHERE p.platform_game_id = pg.id) AS awarded
       FROM platform_game pg WHERE pg.id = ?`,
    )
    .get(platformGameId) as { title: string; awarded: number } | undefined
  if (!entry || entry.awarded === 1) return null

  const achievements = db
    .prepare(
      `SELECT a.tier, a.description, u.id AS unlock_id, u.unlocked_at
       FROM achievement a
       LEFT JOIN unlock u ON u.achievement_id = a.id
       WHERE a.platform_game_id = ?`,
    )
    .all(platformGameId) as unknown as (PlatinumCandidate & {
    unlock_id: number | null
    unlocked_at: string | null
  })[]

  const complete =
    achievements.length > 0 &&
    achievements.every((a) => a.unlock_id !== null) &&
    !achievements.some((a) => isPlatinumAchievement(a, entry.title))
  if (!complete) return null

  const earnedAt = achievements
    .map((a) => a.unlocked_at)
    .reduce<string | null>(
      (latest, at) => (at !== null && (latest === null || at > latest) ? at : latest),
      null,
    )
  db.prepare(
    'INSERT INTO platinum (platform_game_id, earned_at, detected_at) VALUES (?, ?, ?)',
  ).run(platformGameId, earnedAt, detectedAt.toISOString())
  return { earnedAt: earnedAt === null ? null : new Date(earnedAt) }
}

export function awardPlatinums(db: DatabaseSync, detectedAt = new Date()): number {
  const ids = db
    .prepare('SELECT id FROM platform_game WHERE id NOT IN (SELECT platform_game_id FROM platinum)')
    .all() as unknown as { id: number }[]
  return ids.filter(({ id }) => awardPlatinum(db, id, detectedAt) !== null).length
}
