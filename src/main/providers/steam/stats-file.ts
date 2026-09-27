import { join } from 'node:path'
import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type { RemoteGameAchievements, RemoteUnlock } from '@shared/models'

export const MAX_STATS_FILE_BYTES = 64 * 1024
export const MAX_SCHEMA_FILE_BYTES = 8 * 1024 * 1024

const MAX_DEPTH = 16
const APP_ID = /^\d+$/
const BIT = /^(?:[12]?\d|3[01])$/

const SECTION = 0
const TEXT = 1
const INT32 = 2
const FLOAT32 = 3
const END = 8
const ALT_END = 11

export interface KeyValues {
  readonly [key: string]: KeyValue
}
export type KeyValue = string | number | KeyValues

export function parseKeyValues(bytes: Buffer): KeyValues {
  let at = 0

  const fail = (why: string): never => {
    throw new ProviderError('parse', `Steam: unreadable stats file (${why} at byte ${at})`)
  }
  const need = (count: number): void => {
    if (at + count > bytes.length) fail('it ends early')
  }
  const text = (): string => {
    const end = bytes.indexOf(0, at)
    if (end < 0) fail('a text has no end')
    const value = bytes.toString('utf8', at, end)
    at = end + 1
    return value
  }
  const section = (depth: number): KeyValues => {
    if (depth > MAX_DEPTH) fail('it nests too deeply')
    const values: Record<string, KeyValue> = {}
    while (at < bytes.length) {
      const type = bytes[at++]
      if (type === END || type === ALT_END) return values
      const key = text()
      switch (type) {
        case SECTION:
          values[key] = section(depth + 1)
          break
        case TEXT:
          values[key] = text()
          break
        case INT32:
          need(4)
          values[key] = bytes.readInt32LE(at)
          at += 4
          break
        case FLOAT32:
          need(4)
          values[key] = bytes.readFloatLE(at)
          at += 4
          break
        default:
          fail(`unknown value type ${String(type)}`)
      }
    }
    if (depth > 0) fail('a section has no end')
    return values
  }

  return section(0)
}

const schemaFileSchema = z.record(
  z.string(),
  z.object({
    stats: z.record(
      z.string(),
      z.object({
        bits: z.record(z.string(), z.object({ name: z.string().trim().min(1) })).optional(),
      }),
    ),
  }),
)

const userFileSchema = z.object({ cache: z.record(z.string(), z.unknown()) })

const achievementStatSchema = z.object({
  data: z.number().int(),
  AchievementTimes: z.record(z.string(), z.number().int()).optional(),
})

function checkFile<Schema extends z.ZodType>(
  schema: Schema,
  values: KeyValues,
  what: string,
): z.output<Schema> {
  const result = schema.safeParse(values)
  if (!result.success) {
    throw new ProviderError(
      'parse',
      `Steam: unexpected ${what}
${z.prettifyError(result.error)}`,
      {
        cause: result.error,
      },
    )
  }
  return result.data
}

export function localUnlocks(user: Buffer, schema: Buffer, appId: string): RemoteUnlock[] {
  const game = checkFile(schemaFileSchema, parseKeyValues(schema), 'local schema file')[appId]
  if (game === undefined) {
    throw new ProviderError('parse', `Steam: the local schema file is not for app ${appId}`)
  }
  const { cache } = checkFile(userFileSchema, parseKeyValues(user), 'local stats file')

  const unlocks: RemoteUnlock[] = []
  for (const [statId, stat] of Object.entries(game.stats)) {
    const saved = achievementStatSchema.safeParse(cache[statId])
    if (stat.bits === undefined || !saved.success) continue
    for (const [bit, { name }] of Object.entries(stat.bits)) {
      if (!BIT.test(bit) || ((saved.data.data >>> Number(bit)) & 1) === 0) continue
      const seconds = saved.data.AchievementTimes?.[bit] ?? 0
      unlocks.push({
        achievementExternalId: name,
        unlockedAt: seconds > 0 ? new Date(seconds * 1000) : null,
        progress: null,
      })
    }
  }
  return unlocks
}

export interface StatsFileReader {
  readonly readFile: (path: string, maxBytes: number) => Promise<Buffer | null>
}

export async function readLocalUnlocks(
  reader: StatsFileReader,
  statsFolder: string,
  accountId: string,
  appId: string,
): Promise<RemoteUnlock[]> {
  if (!APP_ID.test(appId)) return []
  const [user, schema] = await Promise.all([
    reader.readFile(
      join(statsFolder, `UserGameStats_${accountId}_${appId}.bin`),
      MAX_STATS_FILE_BYTES,
    ),
    reader.readFile(join(statsFolder, `UserGameStatsSchema_${appId}.bin`), MAX_SCHEMA_FILE_BYTES),
  ])
  if (user === null || schema === null) return []
  return localUnlocks(user, schema, appId)
}

export function withLocalUnlocks(
  remote: RemoteGameAchievements,
  local: readonly RemoteUnlock[],
): RemoteGameAchievements {
  const known = new Set(remote.achievements.map((achievement) => achievement.externalId))
  const reported = new Set(remote.unlocks.map((unlock) => unlock.achievementExternalId))
  const early = local.filter(
    (unlock) =>
      known.has(unlock.achievementExternalId) && !reported.has(unlock.achievementExternalId),
  )
  return early.length === 0 ? remote : { ...remote, unlocks: [...remote.unlocks, ...early] }
}
