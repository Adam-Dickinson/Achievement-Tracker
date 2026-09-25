import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type { RemoteAchievement, RemoteGameAchievements, RemoteUnlock } from '@shared/models'

const COVER_TYPES = ['DieselGameBox', 'DieselGameBoxWide', 'DieselGameBoxTall'] as const
const RESIZABLE_HOST = 'cdn1.epicgames.com'
const COVER_WIDTH = 920
const GAMES_CATEGORY = 'games'

const libraryRecordSchema = z.object({
  namespace: z.string().min(1),
  catalogItemId: z.string().min(1),
  appName: z.string(),
  sandboxName: z.string().nullish(),
})

const libraryPageSchema = z.object({
  records: z.array(libraryRecordSchema),
  responseMetadata: z.object({ nextCursor: z.string().nullish() }).nullish(),
})

export type EpicLibraryRecord = z.output<typeof libraryRecordSchema>

export interface EpicLibraryPage {
  readonly records: readonly EpicLibraryRecord[]
  readonly nextCursor: string | null
}

const playtimeSchema = z.array(
  z.object({
    artifactId: z.string(),
    totalTime: z.number().nonnegative(),
  }),
)

const achievementSchema = z.object({
  name: z.string().min(1),
  hidden: z.boolean(),
  unlockedDisplayName: z.string().nullish(),
  lockedDisplayName: z.string().nullish(),
  unlockedDescription: z.string().nullish(),
  lockedDescription: z.string().nullish(),
  unlockedIconLink: z.string().nullish(),
  lockedIconLink: z.string().nullish(),
  XP: z.number().nullish(),
  tier: z.object({ name: z.string() }).nullish(),
  rarity: z.object({ percent: z.number().min(0).max(100) }).nullish(),
})

const achievementRecordSchema = z.object({
  Achievement: z.object({
    productAchievementsRecordBySandbox: z.object({
      totalAchievements: z.number().int().nullable(),
      achievements: z.array(z.object({ achievement: achievementSchema })).nullish(),
    }),
  }),
})

export type EpicAchievement = z.output<typeof achievementSchema>

const playerSchema = z.object({
  PlayerAchievement: z.object({
    playerAchievementGameRecordsBySandbox: z.object({
      records: z
        .array(
          z.object({
            playerAchievements: z
              .array(
                z.object({
                  playerAchievement: z.object({
                    achievementName: z.string().min(1),
                    unlocked: z.boolean(),
                    unlockDate: z.iso.datetime().nullish(),
                  }),
                }),
              )
              .nullish(),
          }),
        )
        .nullable(),
    }),
  }),
})

const catalogSchema = z.record(
  z.string(),
  z.object({
    title: z.string().nullish(),
    keyImages: z.array(z.object({ type: z.string(), url: z.string() })).nullish(),
    categories: z.array(z.object({ path: z.string() })).nullish(),
  }),
)

export interface EpicCatalogDetails {
  readonly title: string | null
  readonly coverUrl: string | null
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
      `Epic: unexpected ${what} response\n${z.prettifyError(result.error)}`,
      { cause: result.error },
    )
  }
  return result.data
}

export function parseLibraryPage(json: unknown): EpicLibraryPage {
  const page = check(libraryPageSchema, json, 'library')
  return { records: page.records, nextCursor: page.responseMetadata?.nextCursor ?? null }
}

export function parsePlaytime(json: unknown): ReadonlyMap<string, number> {
  return new Map(check(playtimeSchema, json, 'playtime').map((p) => [p.artifactId, p.totalTime]))
}

export function parseAchievementCount(json: unknown): number {
  const record = check(achievementRecordSchema, json, 'achievements').Achievement
    .productAchievementsRecordBySandbox
  return record.totalAchievements ?? 0
}

export function parseAchievements(json: unknown): readonly EpicAchievement[] {
  const record = check(achievementRecordSchema, json, 'achievements').Achievement
    .productAchievementsRecordBySandbox
  return (record.achievements ?? []).map((entry) => entry.achievement)
}

export function parsePlayerUnlocks(json: unknown): readonly RemoteUnlock[] {
  const records = check(playerSchema, json, 'player achievements').PlayerAchievement
    .playerAchievementGameRecordsBySandbox.records
  return (records ?? [])
    .flatMap((record) => record.playerAchievements ?? [])
    .map((entry) => entry.playerAchievement)
    .filter((achievement) => achievement.unlocked)
    .map((achievement) => ({
      achievementExternalId: achievement.achievementName,
      unlockedAt: achievement.unlockDate ? new Date(achievement.unlockDate) : null,
      progress: null,
    }))
}

export function parseCatalog(json: unknown): EpicCatalogDetails {
  const items = Object.values(check(catalogSchema, json, 'catalog'))
  const item =
    items.find((i) => i.categories?.some((c) => c.path === GAMES_CATEGORY)) ?? items[0] ?? null
  if (!item) return { title: null, coverUrl: null }

  const images = item.keyImages ?? []
  const cover = COVER_TYPES.map((type) => images.find((image) => image.type === type)).find(
    (image) => image !== undefined,
  )
  return { title: item.title?.trim() || null, coverUrl: cover ? coverUrl(cover.url) : null }
}

export function toGameAchievements(
  achievements: readonly EpicAchievement[],
  unlocks: readonly RemoteUnlock[],
): RemoteGameAchievements {
  const known = new Set(achievements.map((a) => a.name))
  return {
    achievements: achievements.map(toRemoteAchievement),
    unlocks: unlocks.filter((unlock) => known.has(unlock.achievementExternalId)),
  }
}

function toRemoteAchievement(achievement: EpicAchievement): RemoteAchievement {
  return {
    externalId: achievement.name,
    name:
      achievement.unlockedDisplayName?.trim() ||
      achievement.lockedDisplayName?.trim() ||
      achievement.name,
    description:
      achievement.unlockedDescription?.trim() || achievement.lockedDescription?.trim() || null,
    iconUrl: httpsOrNull(achievement.unlockedIconLink),
    iconLockedUrl: httpsOrNull(achievement.lockedIconLink),
    hidden: achievement.hidden,
    points: achievement.XP ?? null,
    tier: achievement.tier?.name ?? null,
    globalPercent: achievement.rarity?.percent ?? null,
  }
}

function coverUrl(raw: string): string | null {
  const url = httpsUrl(raw)
  if (!url) return null
  if (url.host === RESIZABLE_HOST) {
    url.searchParams.set('resize', '1')
    url.searchParams.set('w', String(COVER_WIDTH))
  }
  return url.toString()
}

function httpsOrNull(raw: string | null | undefined): string | null {
  return raw ? (httpsUrl(raw)?.toString() ?? null) : null
}

function httpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol === 'http:') url.protocol = 'https:'
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
