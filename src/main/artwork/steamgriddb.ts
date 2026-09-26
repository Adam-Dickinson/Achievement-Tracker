import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type { Secret } from '@shared/secret'
import { retryAfterMs } from '../providers/http'
import { matchKey } from '../store/match-key'

const BASE_URL = 'https://www.steamgriddb.com/api/v2'
const GRID_QUERY = 'dimensions=920x430,460x215&types=static&nsfw=false&humor=false&epilepsy=false'
const PREFERRED_STYLE = 'alternate'

const gameSchema = z.object({ id: z.number().int().positive(), name: z.string() })
const searchSchema = z.object({ success: z.literal(true), data: z.array(gameSchema) })

const gridSchema = z.object({
  id: z.number().int(),
  style: z.string().nullish(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  thumb: z.string(),
  upvotes: z.number().int().nullish(),
  downvotes: z.number().int().nullish(),
  nsfw: z.boolean().nullish(),
  humor: z.boolean().nullish(),
  epilepsy: z.boolean().nullish(),
})
const gridsSchema = z.object({ success: z.literal(true), data: z.array(gridSchema) })

export type SgdbGame = z.output<typeof gameSchema>
export type SgdbGrid = z.output<typeof gridSchema>

export async function searchGames(
  title: string,
  key: Secret,
  signal?: AbortSignal,
): Promise<SgdbGame[]> {
  const term = encodeURIComponent(title.replace(/[®™©]/g, '').trim())
  const reply = await sgdbGet(`/search/autocomplete/${term}`, key, signal)
  return check(searchSchema, reply.body, 'search').data
}

export async function listGrids(
  gameId: number,
  key: Secret,
  signal?: AbortSignal,
): Promise<SgdbGrid[]> {
  const reply = await sgdbGet(`/grids/game/${gameId}?${GRID_QUERY}`, key, signal)
  if (reply.status === 404) return []
  return check(gridsSchema, reply.body, 'grids').data
}

export function pickGame(games: readonly SgdbGame[], title: string): SgdbGame | null {
  const key = matchKey(title)
  if (key === '') return null
  return games.find((game) => matchKey(game.name) === key) ?? null
}

export function pickGrid(grids: readonly SgdbGrid[]): string | null {
  const usable = grids.filter(
    (grid) => !grid.nsfw && !grid.humor && !grid.epilepsy && isHttps(grid.thumb),
  )
  const [best] = [...usable].sort(
    (a, b) =>
      votes(b) - votes(a) ||
      Number(b.style === PREFERRED_STYLE) - Number(a.style === PREFERRED_STYLE) ||
      b.width - a.width,
  )
  return best?.thumb ?? null
}

interface SgdbReply {
  readonly status: number
  readonly body: unknown
}

async function sgdbGet(path: string, key: Secret, signal?: AbortSignal): Promise<SgdbReply> {
  let response: Response
  let text: string
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${key.expose()}` },
      signal,
    })
    text = await response.text()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ProviderError('network', 'SteamGridDB: could not reach steamgriddb.com', {
      cause: error,
    })
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError('auth_expired', 'SteamGridDB: the API key was refused')
  }
  if (response.status === 429) {
    throw new ProviderError('rate_limited', 'SteamGridDB: too many requests', {
      retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
    })
  }
  if (response.status >= 500) {
    throw new ProviderError('network', `SteamGridDB: server error (HTTP ${response.status})`)
  }
  if (!response.ok && response.status !== 404) {
    throw new ProviderError('other', `SteamGridDB: unexpected reply (HTTP ${response.status})`)
  }
  return { status: response.status, body: readBody(text, response.ok) }
}

function readBody(text: string, ok: boolean): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (!ok) return null
    throw new ProviderError('parse', 'SteamGridDB: invalid JSON', { cause: error })
  }
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
      `SteamGridDB: unexpected ${what} response\n${z.prettifyError(result.error)}`,
      { cause: result.error },
    )
  }
  return result.data
}

function votes(grid: SgdbGrid): number {
  return (grid.upvotes ?? 0) - (grid.downvotes ?? 0)
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
