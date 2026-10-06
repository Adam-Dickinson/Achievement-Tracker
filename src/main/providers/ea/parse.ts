import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type {
  RemoteAchievement,
  RemoteGame,
  RemoteGameAchievements,
  RemoteUnlock,
} from '@shared/models'

const RECENT_MS = 14 * 24 * 60 * 60 * 1000
const COVER_WIDTH = 920
const PORTRAIT_WIDTH = 600
const ICON_SIZES = ['208', '416', '40'] as const
const NEVER_PLAYED_BEFORE = Date.UTC(2000, 0, 1)

const imageSchema = z.object({ largestImage: z.object({ path: z.string() }).nullish() }).nullish()

const ownedSchema = z.object({
  me: z.object({
    ownedGameProducts: z.object({
      items: z.array(
        z.object({
          originOfferId: z.string().min(1),
          product: z
            .object({
              name: z.string().nullish(),
              gameSlug: z.string().nullish(),
              baseItem: z
                .object({
                  gameType: z.string().nullish(),
                  title: z.string().nullish(),
                  keyArt: imageSchema,
                  packArt: imageSchema,
                })
                .nullish(),
            })
            .nullish(),
        }),
      ),
    }),
  }),
})

const offersSchema = z.object({
  legacyOffers: z.array(
    z.object({ offerId: z.string().min(1), achievementSetOverride: z.string().nullish() }),
  ),
  me: z.object({
    recentGames: z.object({
      items: z.array(
        z.object({
          gameSlug: z.string().min(1),
          totalPlayTimeSeconds: z.number().int().min(0).nullish(),
          lastSessionEndDate: z.iso.datetime({ offset: true }).nullish(),
        }),
      ),
    }),
  }),
})

const identitySchema = z.object({
  me: z.object({
    player: z.object({
      pd: z.string().regex(/^\d+$/),
      psd: z.string().regex(/^\d+$/),
      displayName: z.string().nullish(),
    }),
  }),
})

const achievementSchema = z.object({
  name: z.string().nullish(),
  desc: z.string().nullish(),
  icons: z.record(z.string(), z.string()).nullish(),
  hidden: z.boolean().nullish(),
  complete: z.boolean(),
  u: z.number().nullish(),
  state: z.object({ st_ct: z.number().nullish() }).nullish(),
  achievedPercentage: z.string().nullish(),
})

const achievementsSchema = z.record(z.string(), achievementSchema)

type EaAchievement = z.output<typeof achievementSchema>
type OwnedItem = z.output<typeof ownedSchema>['me']['ownedGameProducts']['items'][number]

export interface EaIdentity {
  readonly accountId: string
  readonly personaId: string
  readonly displayName: string | null
}

export interface OwnedGame {
  readonly offerId: string
  readonly slug: string | null
  readonly title: string
  readonly coverUrl: string | null
  readonly portraitUrl: string | null
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
      `EA: unexpected ${what} response\n${z.prettifyError(result.error)}`,
      { cause: result.error },
    )
  }
  return result.data
}

export function parseIdentity(json: unknown): EaIdentity {
  const { player } = check(identitySchema, json, 'identity').me
  return {
    accountId: player.pd,
    personaId: player.psd,
    displayName: player.displayName?.trim() || null,
  }
}

export function parseOwned(json: unknown): readonly OwnedGame[] {
  return check(ownedSchema, json, 'owned games')
    .me.ownedGameProducts.items.filter(isBaseGame)
    .map((item) => ({
      offerId: item.originOfferId,
      slug: item.product?.gameSlug?.trim() || null,
      title:
        item.product?.baseItem?.title?.trim() || item.product?.name?.trim() || item.originOfferId,
      coverUrl: coverUrl(item.product?.baseItem?.keyArt?.largestImage?.path),
      portraitUrl: coverUrl(item.product?.baseItem?.packArt?.largestImage?.path, PORTRAIT_WIDTH),
    }))
}

export function parseLibrary(
  owned: readonly OwnedGame[],
  json: unknown,
  now: Date,
): readonly RemoteGame[] {
  const data = check(offersSchema, json, 'offers')
  const setByOffer = new Map(
    data.legacyOffers.map((offer) => [offer.offerId, offer.achievementSetOverride?.trim() || null]),
  )
  const lastPlayedBySlug = new Map(
    data.me.recentGames.items.map((game) => [game.gameSlug, playedDate(game.lastSessionEndDate)]),
  )

  const playtimeBySlug = new Map(
    data.me.recentGames.items.map((game) => [game.gameSlug, game.totalPlayTimeSeconds ?? null]),
  )

  const games = new Map<string, RemoteGame>()
  for (const game of owned) {
    const setId = setByOffer.get(game.offerId)
    if (!setId) continue
    const lastPlayed = (game.slug && lastPlayedBySlug.get(game.slug)) || null
    const known = games.get(setId)
    const playtimeSeconds = largest(
      known?.playtimeSeconds ?? null,
      game.slug ? (playtimeBySlug.get(game.slug) ?? null) : null,
    )
    if (known && !isLater(lastPlayed, known.lastPlayed)) {
      games.set(setId, { ...known, playtimeSeconds })
      continue
    }
    games.set(setId, {
      ref: { externalId: setId },
      title: known?.title ?? game.title,
      iconUrl: null,
      coverUrl: known?.coverUrl ?? game.coverUrl,
      portraitUrl: known?.portraitUrl ?? game.portraitUrl,
      lastPlayed,
      recentlyPlayed: lastPlayed !== null && now.getTime() - lastPlayed.getTime() <= RECENT_MS,
      playtimeSeconds,
    })
  }
  return [...games.values()]
}

export function parseAchievements(json: unknown): RemoteGameAchievements {
  const entries = Object.entries(check(achievementsSchema, json, 'achievements')).sort(([a], [b]) =>
    a.localeCompare(b, 'en', { numeric: true }),
  )
  const hasRarity = entries.some(([, achievement]) => (percent(achievement) ?? 0) > 0)
  return {
    achievements: entries.map(([id, achievement]) =>
      toRemoteAchievement(id, achievement, hasRarity),
    ),
    unlocks: entries.flatMap(([id, achievement]) => toUnlock(id, achievement)),
  }
}

function toRemoteAchievement(
  id: string,
  achievement: EaAchievement,
  hasRarity: boolean,
): RemoteAchievement {
  return {
    externalId: id,
    name: achievement.name?.trim() || id,
    description: achievement.desc?.trim() || null,
    iconUrl: iconUrl(achievement.icons),
    iconLockedUrl: null,
    hidden: achievement.hidden ?? false,
    points: null,
    tier: null,
    globalPercent: hasRarity ? percent(achievement) : null,
  }
}

function toUnlock(id: string, achievement: EaAchievement): RemoteUnlock[] {
  if (!achievement.complete) return []
  const seconds = achievement.state?.st_ct ?? achievement.u
  return [
    {
      achievementExternalId: id,
      unlockedAt: seconds && seconds > 0 ? new Date(seconds * 1000) : null,
      progress: null,
    },
  ]
}

function percent(achievement: EaAchievement): number | null {
  const value = Number(achievement.achievedPercentage)
  return achievement.achievedPercentage && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null
}

function isBaseGame(item: OwnedItem): boolean {
  const type = item.product?.baseItem?.gameType
  return !type || type === 'BASE_GAME'
}

function playedDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return date.getTime() < NEVER_PLAYED_BEFORE ? null : date
}

function largest(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return a ?? b
  return Math.max(a, b)
}

function isLater(candidate: Date | null, current: Date | null): boolean {
  return candidate !== null && (current === null || candidate > current)
}

function iconUrl(icons: Readonly<Record<string, string>> | null | undefined): string | null {
  for (const size of ICON_SIZES) {
    const url = httpsOrNull(icons?.[size])
    if (url) return url
  }
  return null
}

function coverUrl(raw: string | null | undefined, width = COVER_WIDTH): string | null {
  const url = raw ? httpsUrl(raw) : null
  if (!url) return null
  url.searchParams.set('w', String(width))
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
