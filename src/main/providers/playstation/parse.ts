import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type {
  RemoteAchievement,
  RemoteGame,
  RemoteGameAchievements,
  RemoteUnlock,
} from '@shared/models'

const RECENT_MS = 14 * 24 * 60 * 60 * 1000
const TIERS = new Set(['bronze', 'silver', 'gold', 'platinum'])
const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  PS5: 'PS5',
  PS4: 'PS4',
  PS3: 'PS3',
  PSVITA: 'PS Vita',
  PSPC: 'PC',
}

const idSchema = z.string().regex(/^[A-Za-z0-9_]+$/)
const serviceSchema = z.string().regex(/^[a-z0-9]+$/)

const titleSchema = z.object({
  npServiceName: serviceSchema,
  npCommunicationId: idSchema,
  trophyTitleName: z.string(),
  trophyTitleIconUrl: z.string().nullish(),
  trophyTitlePlatform: z.string().nullish(),
  lastUpdatedDateTime: z.iso.datetime({ offset: true }).nullish(),
})

const titlesSchema = z.object({ trophyTitles: z.array(titleSchema) })

const titleTrophySchema = z.object({
  trophyId: z.number().int().nonnegative(),
  trophyHidden: z.boolean().nullish(),
  trophyType: z.string().nullish(),
  trophyName: z.string().nullish(),
  trophyDetail: z.string().nullish(),
  trophyIconUrl: z.string().nullish(),
})

const userTrophySchema = z.object({
  trophyId: z.number().int().nonnegative(),
  earned: z.boolean(),
  earnedDateTime: z.iso.datetime({ offset: true }).nullish(),
  trophyEarnedRate: z.string().nullish(),
})

const titleTrophiesSchema = z.object({ trophies: z.array(titleTrophySchema) })
const userTrophiesSchema = z.object({ trophies: z.array(userTrophySchema) })

const summarySchema = z.object({ accountId: z.string().regex(/^\d+$/) })
const profileSchema = z.object({ onlineId: z.string().nullish() })

type Title = z.output<typeof titleSchema>
type UserTrophy = z.output<typeof userTrophySchema>

export interface TrophySet {
  readonly service: string
  readonly id: string
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
      `PlayStation: unexpected ${what} response\n${z.prettifyError(result.error)}`,
      { cause: result.error },
    )
  }
  return result.data
}

export function gameExternalId(set: TrophySet): string {
  return `${set.service}/${set.id}`
}

export function parseGameExternalId(externalId: string): TrophySet {
  const [service = '', id = '', ...rest] = externalId.split('/')
  if (
    rest.length > 0 ||
    !serviceSchema.safeParse(service).success ||
    !idSchema.safeParse(id).success
  ) {
    throw new ProviderError('other', `PlayStation: "${externalId}" is not a trophy set`)
  }
  return { service, id }
}

export function parseAccountId(json: unknown): string {
  return check(summarySchema, json, 'trophy summary').accountId
}

export function parseOnlineId(json: unknown): string | null {
  return check(profileSchema, json, 'profile').onlineId?.trim() || null
}

export function parseLibrary(pages: readonly unknown[], now: Date): readonly RemoteGame[] {
  const titles = pages.flatMap((page) => check(titlesSchema, page, 'trophy titles').trophyTitles)
  const nameCounts = new Map<string, number>()
  for (const title of titles) {
    const name = gameName(title)
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  }
  return titles.map((title) => toGame(title, (nameCounts.get(gameName(title)) ?? 0) > 1, now))
}

export function parseTrophies(
  titlePages: readonly unknown[],
  userPages: readonly unknown[],
): RemoteGameAchievements {
  const defined = titlePages.flatMap(
    (page) => check(titleTrophiesSchema, page, 'title trophies').trophies,
  )
  const progress = new Map(
    userPages
      .flatMap((page) => check(userTrophiesSchema, page, 'earned trophies').trophies)
      .map((trophy) => [trophy.trophyId, trophy]),
  )

  const achievements = defined.map((trophy): RemoteAchievement => ({
    externalId: String(trophy.trophyId),
    name: trophy.trophyName?.trim() || `Trophy ${trophy.trophyId}`,
    description: trophy.trophyDetail?.trim() || null,
    iconUrl: httpsOrNull(trophy.trophyIconUrl),
    iconLockedUrl: null,
    hidden: trophy.trophyHidden ?? false,
    points: null,
    tier: trophy.trophyType && TIERS.has(trophy.trophyType) ? trophy.trophyType : null,
    globalPercent: percent(progress.get(trophy.trophyId)),
  }))
  const unlocks = defined.flatMap((trophy): RemoteUnlock[] => {
    const earned = progress.get(trophy.trophyId)
    if (!earned?.earned) return []
    return [
      {
        achievementExternalId: String(trophy.trophyId),
        unlockedAt: earned.earnedDateTime ? new Date(earned.earnedDateTime) : null,
        progress: null,
      },
    ]
  })
  return { achievements, unlocks }
}

function gameName(title: Title): string {
  const name = title.trophyTitleName.trim()
  return name.replace(/\s+(trophy set|trophies)$/i, '') || name
}

function toGame(title: Title, sharesName: boolean, now: Date): RemoteGame {
  const name = gameName(title)
  const platform = platformLabel(title.trophyTitlePlatform)
  const lastPlayed = title.lastUpdatedDateTime ? new Date(title.lastUpdatedDateTime) : null
  const art = httpsOrNull(title.trophyTitleIconUrl)
  return {
    ref: {
      externalId: gameExternalId({ service: title.npServiceName, id: title.npCommunicationId }),
    },
    title: sharesName && platform ? `${name} (${platform})` : name,
    iconUrl: art,
    coverUrl: art,
    lastPlayed,
    recentlyPlayed: lastPlayed !== null && now.getTime() - lastPlayed.getTime() <= RECENT_MS,
  }
}

function platformLabel(platforms: string | null | undefined): string | null {
  const labels = (platforms ?? '')
    .split(',')
    .map((platform) => platform.trim())
    .filter((platform) => platform !== '')
    .map((platform) => PLATFORM_LABELS[platform] ?? platform)
  return labels.length > 0 ? labels.join(' / ') : null
}

function percent(trophy: UserTrophy | undefined): number | null {
  if (!trophy?.trophyEarnedRate) return null
  const value = Number(trophy.trophyEarnedRate)
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

function httpsOrNull(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
