import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type {
  AccountInfo,
  RemoteAchievement,
  RemoteGame,
  RemoteGameAchievements,
  RemoteUnlock,
} from '@shared/models'

const STEAM_APP_IMAGES = 'https://media.steampowered.com/steamcommunity/public/images/apps'
const STEAM_STORE_ART = 'https://cdn.akamai.steamstatic.com/steam/apps'

const percentSchema = z
  .union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())])
  .pipe(z.number().min(0).max(100))

const flagSchema = z.union([z.literal(0), z.literal(1)])

const achievementIdSchema = z.string().trim().min(1)

const rarityResponseSchema = z.object({
  achievementpercentages: z
    .object({
      achievements: z.array(z.object({ name: achievementIdSchema, percent: percentSchema })),
    })
    .optional(),
})

const schemaAchievementSchema = z.object({
  name: achievementIdSchema,
  displayName: z.string(),
  description: z.string().optional(),
  hidden: flagSchema,
  icon: z.string(),
  icongray: z.string(),
})

const schemaResponseSchema = z.object({
  game: z.object({
    availableGameStats: z
      .object({ achievements: z.array(schemaAchievementSchema).optional() })
      .optional(),
  }),
})

const playerAchievementSchema = z.object({
  apiname: achievementIdSchema,
  achieved: flagSchema,
  unlocktime: z.number().int().min(0),
})

const playerResponseSchema = z.object({
  playerstats: z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      achievements: z.array(playerAchievementSchema).optional(),
    }),
    z.object({ success: z.literal(false), error: z.string() }),
  ]),
})

const NO_STATS_ERROR = 'Requested app has no stats'

const ownedGameSchema = z.object({
  appid: z.number().int().positive(),
  name: z.string(),
  img_icon_url: z.string(),
  has_community_visible_stats: z.boolean().optional(),
  rtime_last_played: z.number().int().min(0),
})

const ownedGamesResponseSchema = z.object({
  response: z.object({ games: z.array(ownedGameSchema).optional() }),
})

const recentGameSchema = z.object({
  appid: z.number().int().positive(),
  name: z.string(),
  img_icon_url: z.string().optional(),
})

const recentlyPlayedResponseSchema = z.object({
  response: z.object({ games: z.array(recentGameSchema).optional() }),
})

const playerSummaryResponseSchema = z.object({
  response: z.object({
    players: z.array(z.object({ steamid: z.string().min(1), personaname: z.string().min(1) })),
  }),
})

export type SteamSchemaAchievement = z.infer<typeof schemaAchievementSchema>
export type SteamPlayerAchievement = z.infer<typeof playerAchievementSchema>

interface SteamLibraryGame {
  readonly appid: number
  readonly name: string
  readonly img_icon_url?: string
  readonly rtime_last_played?: number
}

function check<Schema extends z.ZodType>(
  schema: Schema,
  json: unknown,
  what: string,
): z.output<Schema> {
  const result = schema.safeParse(json)
  if (!result.success) {
    throw new ProviderError(
      'parse',
      `Steam: unexpected ${what} response\n${z.prettifyError(result.error)}`,
      { cause: result.error },
    )
  }
  return result.data
}

export function parsePlayerSummary(json: unknown): AccountInfo {
  const [player] = check(playerSummaryResponseSchema, json, 'player summary').response.players
  if (player === undefined) {
    throw new ProviderError('other', 'Steam: no profile found for this SteamID')
  }
  return { externalId: player.steamid, displayName: player.personaname }
}

export function parseLibrary(ownedJson: unknown, recentJson: unknown): RemoteGame[] {
  const owned = check(ownedGamesResponseSchema, ownedJson, 'owned games').response.games ?? []
  const recent =
    check(recentlyPlayedResponseSchema, recentJson, 'recently played').response.games ?? []

  const ownedIds = new Set(owned.map((game) => game.appid))
  const recentIds = new Set(recent.map((game) => game.appid))
  const withStats = owned.filter((game) => game.has_community_visible_stats === true)
  const notOwned = recent.filter((game) => !ownedIds.has(game.appid))
  return [...withStats, ...notOwned].map((game) => toRemoteGame(game, recentIds.has(game.appid)))
}

export function parseGlobalPercentages(json: unknown): Map<string, number> {
  const data = check(rarityResponseSchema, json, 'rarity')
  const achievements = data.achievementpercentages?.achievements ?? []
  return new Map(achievements.map((achievement) => [achievement.name, achievement.percent]))
}

export function parseGameSchema(json: unknown): SteamSchemaAchievement[] {
  const data = check(schemaResponseSchema, json, 'game schema')
  return data.game.availableGameStats?.achievements ?? []
}

export function parsePlayerAchievements(json: unknown): SteamPlayerAchievement[] {
  const { playerstats } = check(playerResponseSchema, json, 'player achievements')
  if (playerstats.success) return playerstats.achievements ?? []
  if (playerstats.error === NO_STATS_ERROR) return []
  throw new ProviderError('other', `Steam: ${playerstats.error}`)
}

export function toGameAchievements(
  schema: readonly SteamSchemaAchievement[],
  player: readonly SteamPlayerAchievement[],
  percents: ReadonlyMap<string, number>,
): RemoteGameAchievements {
  const achievements = schema.map((achievement) => toRemoteAchievement(achievement, percents))

  const known = new Set(achievements.map((achievement) => achievement.externalId))
  const unlocks = player
    .filter((row) => row.achieved === 1 && known.has(row.apiname))
    .map(toRemoteUnlock)

  return { achievements, unlocks }
}

function toRemoteGame(game: SteamLibraryGame, recentlyPlayed: boolean): RemoteGame {
  const iconHash = textOrNull(game.img_icon_url)
  return {
    ref: { externalId: String(game.appid) },
    title: game.name,
    iconUrl: iconHash === null ? null : `${STEAM_APP_IMAGES}/${game.appid}/${iconHash}.jpg`,
    coverUrl: `${STEAM_STORE_ART}/${game.appid}/header.jpg`,
    lastPlayed: fromUnixSeconds(game.rtime_last_played ?? 0),
    recentlyPlayed,
  }
}

function toRemoteAchievement(
  achievement: SteamSchemaAchievement,
  percents: ReadonlyMap<string, number>,
): RemoteAchievement {
  return {
    externalId: achievement.name,
    name: achievement.displayName,
    description: textOrNull(achievement.description),
    iconUrl: textOrNull(achievement.icon),
    iconLockedUrl: textOrNull(achievement.icongray),
    hidden: achievement.hidden === 1,
    points: null,
    tier: null,
    globalPercent: percents.get(achievement.name) ?? null,
  }
}

function toRemoteUnlock(row: SteamPlayerAchievement): RemoteUnlock {
  return {
    achievementExternalId: row.apiname,
    unlockedAt: fromUnixSeconds(row.unlocktime),
    progress: null,
  }
}

function fromUnixSeconds(seconds: number): Date | null {
  return seconds > 0 ? new Date(seconds * 1000) : null
}

function textOrNull(value: string | undefined): string | null {
  return value !== undefined && value.trim() !== '' ? value : null
}
