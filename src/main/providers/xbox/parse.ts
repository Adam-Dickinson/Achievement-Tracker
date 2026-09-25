import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type {
  RemoteAchievement,
  RemoteGame,
  RemoteGameAchievements,
  RemoteUnlock,
} from '@shared/models'

const XBOX_ACHIEVEMENTS = 2
const ACHIEVED = 'Achieved'
const GAMERSCORE = 'Gamerscore'
const ICON = 'Icon'
const RECENT_MS = 14 * 24 * 60 * 60 * 1000
const COVER_TYPES = ['TitledHeroArt', 'SuperHeroArt', 'BoxArt'] as const
const STORE_IMAGES_HOST = 'store-images.s-microsoft.com'

interface ImageSize {
  readonly w: number
  readonly h?: number
}

const COVER_SIZE: ImageSize = { w: 920 }
const ICON_SIZE: ImageSize = { w: 128, h: 128 }

const titleImageSchema = z.object({
  url: z.string(),
  type: z.string(),
})

const titleSchema = z.object({
  titleId: z.string().regex(/^\d+$/),
  name: z.string(),
  displayImage: z.string().nullish(),
  images: z.array(titleImageSchema).nullish(),
  titleHistory: z.object({ lastTimePlayed: z.iso.datetime() }).nullish(),
  achievement: z.object({ sourceVersion: z.number().int() }).nullish(),
})

const titleHistorySchema = z.object({
  titles: z.array(titleSchema),
})

type XboxTitle = z.output<typeof titleSchema>

const achievementSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().nullish(),
  isSecret: z.boolean(),
  progressState: z.string(),
  progression: z.object({ timeUnlocked: z.iso.datetime() }),
  mediaAssets: z.array(z.object({ type: z.string(), url: z.string() })).nullish(),
  rewards: z.array(z.object({ type: z.string(), value: z.string() })).nullish(),
  rarity: z.object({ currentPercentage: z.number().min(0).max(100) }).nullish(),
})

const achievementsPageSchema = z.object({
  achievements: z.array(achievementSchema),
  pagingInfo: z.object({ continuationToken: z.string().nullable() }),
})

export type XboxAchievement = z.output<typeof achievementSchema>

export interface XboxAchievementsPage {
  readonly achievements: readonly XboxAchievement[]
  readonly continuationToken: string | null
}

export function check<Schema extends z.ZodType>(
  schema: Schema,
  json: unknown,
  what: string,
): z.output<Schema> {
  const result = schema.safeParse(json)
  if (!result.success) {
    throw new ProviderError(
      'parse',
      `Xbox: unexpected ${what} response\n${z.prettifyError(result.error)}`,
      { cause: result.error },
    )
  }
  return result.data
}

export function parseTitleHistory(json: unknown, now: Date): RemoteGame[] {
  return check(titleHistorySchema, json, 'title history')
    .titles.filter((title) => title.achievement?.sourceVersion === XBOX_ACHIEVEMENTS)
    .map((title) => toRemoteGame(title, now))
}

export function parseAchievementsPage(json: unknown): XboxAchievementsPage {
  const page = check(achievementsPageSchema, json, 'achievements')
  return {
    achievements: page.achievements,
    continuationToken: page.pagingInfo.continuationToken,
  }
}

export function toGameAchievements(list: readonly XboxAchievement[]): RemoteGameAchievements {
  return {
    achievements: list.map(toRemoteAchievement),
    unlocks: list
      .filter((achievement) => achievement.progressState === ACHIEVED)
      .map(toRemoteUnlock),
  }
}

function toRemoteAchievement(achievement: XboxAchievement): RemoteAchievement {
  const icon = achievement.mediaAssets?.find((asset) => asset.type === ICON)
  return {
    externalId: achievement.id,
    name: achievement.name,
    description: achievement.description || null,
    iconUrl: imageUrl(icon?.url, ICON_SIZE),
    iconLockedUrl: null,
    hidden: achievement.isSecret,
    points: gamerscore(achievement.rewards),
    tier: null,
    globalPercent: achievement.rarity?.currentPercentage ?? null,
  }
}

function toRemoteUnlock(achievement: XboxAchievement): RemoteUnlock {
  return {
    achievementExternalId: achievement.id,
    unlockedAt: fromXboxTime(achievement.progression.timeUnlocked),
    progress: null,
  }
}

function gamerscore(rewards: XboxAchievement['rewards']): number | null {
  const reward = rewards?.find((candidate) => candidate.type === GAMERSCORE)
  if (!reward || reward.value.trim() === '') return null
  const points = Number(reward.value)
  return Number.isInteger(points) && points >= 0 ? points : null
}

function fromXboxTime(text: string): Date | null {
  const date = new Date(text)
  return date.getTime() > 0 ? date : null
}

function toRemoteGame(title: XboxTitle, now: Date): RemoteGame {
  const lastPlayed = title.titleHistory ? new Date(title.titleHistory.lastTimePlayed) : null
  return {
    ref: { externalId: title.titleId },
    title: title.name,
    iconUrl: imageUrl(title.displayImage, ICON_SIZE),
    coverUrl: imageUrl(coverImage(title) ?? title.displayImage, COVER_SIZE),
    lastPlayed,
    recentlyPlayed: lastPlayed !== null && now.getTime() - lastPlayed.getTime() <= RECENT_MS,
  }
}

function coverImage(title: XboxTitle): string | undefined {
  for (const type of COVER_TYPES) {
    const image = title.images?.find((candidate) => candidate.type === type)
    if (image) return image.url
  }
  return undefined
}

function imageUrl(raw: string | null | undefined, size: ImageSize): string | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  url.protocol = 'https:'
  if (url.hostname === STORE_IMAGES_HOST) {
    url.searchParams.set('w', String(size.w))
    if (size.h !== undefined) url.searchParams.set('h', String(size.h))
  }
  return url.toString()
}
