import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type {
  RemoteAchievement,
  RemoteGame,
  RemoteGameAchievements,
  RemoteUnlock,
} from '@shared/models'

const RECENT_MS = 14 * 24 * 60 * 60 * 1000
const RESIZABLE_HOST = 'ubiservices.cdn.ubi.com'
const COVER_WIDTH = 920
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/

const countsSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
})

const gameSchema = z.object({
  spaceId: z.string().regex(UUID),
  name: z.string().nullish(),
  avatarUrl: z.string().nullish(),
  backgroundUrl: z.string().nullish(),
  viewer: z
    .object({
      meta: z
        .object({
          lastPlayedDate: z.iso.datetime({ offset: true }).nullish(),
          achievements: countsSchema.nullish(),
        })
        .nullish(),
    })
    .nullish(),
})

const gamesSchema = z.object({
  viewer: z.object({
    id: z.string().regex(UUID),
    name: z.string().nullish(),
    games: z.object({ nodes: z.array(gameSchema) }),
  }),
})

const achievementSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullish(),
  description: z.string().nullish(),
  icon: z.string().nullish(),
  viewer: z
    .object({
      meta: z
        .object({
          isCompleted: z.boolean(),
          completionDate: z
            .string()
            .refine((value) => !Number.isNaN(toUtcDate(value).getTime()), 'not a date')
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
})

const achievementsSchema = z.object({
  game: z
    .object({
      viewer: z
        .object({
          meta: z
            .object({
              achievements: z
                .object({ totalCount: z.number().int(), nodes: z.array(achievementSchema) })
                .nullish(),
            })
            .nullish(),
        })
        .nullish(),
    })
    .nullable(),
})

type UbisoftAchievement = z.output<typeof achievementSchema>

export interface UbisoftViewer {
  readonly id: string
  readonly name: string | null
}

export interface UbisoftLibrary {
  readonly viewer: UbisoftViewer
  readonly games: readonly RemoteGame[]
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
      `Ubisoft: unexpected ${what} response\n${z.prettifyError(result.error)}`,
      { cause: result.error },
    )
  }
  return result.data
}

export function parseLibrary(json: unknown, now: Date): UbisoftLibrary {
  const { viewer } = check(gamesSchema, json, 'games')
  const seen = new Set<string>()
  const games: RemoteGame[] = []
  for (const game of viewer.games.nodes) {
    const spaceId = game.spaceId.toLowerCase()
    const meta = game.viewer?.meta
    if (seen.has(spaceId) || !meta?.achievements?.totalCount) continue
    seen.add(spaceId)

    const lastPlayed = meta.lastPlayedDate ? new Date(meta.lastPlayedDate) : null
    games.push({
      ref: { externalId: spaceId },
      title: game.name?.trim() || spaceId,
      iconUrl: httpsOrNull(game.avatarUrl),
      coverUrl: coverUrl(game.backgroundUrl),
      lastPlayed,
      recentlyPlayed: lastPlayed !== null && now.getTime() - lastPlayed.getTime() <= RECENT_MS,
    })
  }
  return {
    viewer: { id: viewer.id.toLowerCase(), name: viewer.name?.trim() || null },
    games,
  }
}

export function parseAchievements(json: unknown): RemoteGameAchievements {
  const nodes =
    check(achievementsSchema, json, 'achievements').game?.viewer?.meta?.achievements?.nodes ?? []
  return {
    achievements: nodes.map(toRemoteAchievement),
    unlocks: nodes.flatMap(toUnlock),
  }
}

function toRemoteAchievement(achievement: UbisoftAchievement): RemoteAchievement {
  return {
    externalId: achievement.id,
    name: achievement.title?.trim() || achievement.id,
    description: achievement.description?.trim() || null,
    iconUrl: httpsOrNull(achievement.icon),
    iconLockedUrl: null,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: null,
  }
}

function toUnlock(achievement: UbisoftAchievement): RemoteUnlock[] {
  const meta = achievement.viewer?.meta
  if (!meta?.isCompleted) return []
  return [
    {
      achievementExternalId: achievement.id,
      unlockedAt: meta.completionDate ? toUtcDate(meta.completionDate) : null,
      progress: null,
    },
  ]
}

function toUtcDate(value: string): Date {
  return new Date(LOCAL_DATE_TIME.test(value) ? `${value}Z` : value)
}

function coverUrl(raw: string | null | undefined): string | null {
  const url = raw ? httpsUrl(raw) : null
  if (!url) return null
  if (url.host === RESIZABLE_HOST) url.searchParams.set('imwidth', String(COVER_WIDTH))
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
