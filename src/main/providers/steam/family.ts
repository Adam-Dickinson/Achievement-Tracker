import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type { RemoteGame } from '@shared/models'
import type { Secret } from '@shared/secret'
import { steamGet } from './api'
import { check, STEAM_APP_IMAGES, STEAM_STORE_ART } from './parse'

const FAMILY_GROUP = '/IFamilyGroupsService/GetFamilyGroupForUser/v1/'
const SHARED_LIBRARY = '/IFamilyGroupsService/GetSharedLibraryApps/v1/'
const STORE_ITEMS = '/IStoreBrowseService/GetItems/v1/'
const STEAM_ACHIEVEMENTS_CATEGORY = 22
const STORE_BATCH = 50
const STORE_FOUND = 1
const SHAREABLE = 0
const RECENT_MS = 14 * 24 * 60 * 60 * 1000

export interface FamilyApp {
  readonly appid: string
  readonly name: string
  readonly iconHash: string | null
  readonly lastPlayed: Date | null
}

const groupSchema = z.object({
  response: z.object({
    family_groupid: z.string().regex(/^\d+$/).optional(),
    is_not_member_of_any_group: z.boolean().optional(),
  }),
})

const sharedSchema = z.object({
  response: z.object({
    apps: z
      .array(
        z.object({
          appid: z.number().int().positive(),
          name: z.string(),
          img_icon_hash: z.string().optional(),
          exclude_reason: z.number().int().optional(),
          rt_last_played: z.number().int().min(0).optional(),
          owner_steamids: z.array(z.string()),
        }),
      )
      .optional(),
  }),
})

const storeItemsSchema = z.object({
  response: z.object({
    store_items: z
      .array(
        z.object({
          id: z.number().int(),
          success: z.number().int(),
          categories: z
            .object({ feature_categoryids: z.array(z.number().int()).optional() })
            .optional(),
        }),
      )
      .optional(),
  }),
})

export async function fetchFamilyApps(
  token: Secret,
  steamId: string,
  signal?: AbortSignal,
): Promise<readonly FamilyApp[]> {
  const group = check(
    groupSchema,
    await familyGet(FAMILY_GROUP, { steamid: steamId }, token, signal),
    'family group',
  ).response
  if (!group.family_groupid) return []

  const shared = check(
    sharedSchema,
    await familyGet(
      SHARED_LIBRARY,
      {
        family_groupid: group.family_groupid,
        steamid: steamId,
        include_own: 'true',
        include_excluded: 'true',
        include_free: 'true',
        include_non_games: 'false',
      },
      token,
      signal,
    ),
    'family library',
  ).response
  return (shared.apps ?? [])
    .filter((app) => !app.owner_steamids.includes(steamId))
    .filter((app) => (app.exclude_reason ?? SHAREABLE) === SHAREABLE)
    .map((app) => ({
      appid: String(app.appid),
      name: app.name.trim() || String(app.appid),
      iconHash: app.img_icon_hash?.trim() || null,
      lastPlayed: app.rt_last_played ? new Date(app.rt_last_played * 1000) : null,
    }))
}

export async function fetchStoreAchievementFlags(
  appids: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, boolean | null>> {
  const flags = new Map<string, boolean | null>(appids.map((appid) => [appid, null]))
  for (let start = 0; start < appids.length; start += STORE_BATCH) {
    const batch = appids.slice(start, start + STORE_BATCH)
    const input = {
      ids: batch.map((appid) => ({ appid: Number(appid) })),
      context: { language: 'english', country_code: 'US' },
      data_request: { include_basic_info: true },
    }
    const items = check(
      storeItemsSchema,
      await steamGet(STORE_ITEMS, { input_json: JSON.stringify(input) }, { signal }),
      'store items',
    ).response.store_items
    for (const item of items ?? []) {
      const appid = String(item.id)
      if (item.success !== STORE_FOUND || !flags.has(appid)) continue
      const features = item.categories?.feature_categoryids ?? []
      flags.set(appid, features.includes(STEAM_ACHIEVEMENTS_CATEGORY))
    }
  }
  return flags
}

export function toFamilyGame(app: FamilyApp, now: Date): RemoteGame {
  return {
    ref: { externalId: app.appid },
    title: app.name,
    iconUrl: app.iconHash ? `${STEAM_APP_IMAGES}/${app.appid}/${app.iconHash}.jpg` : null,
    coverUrl: `${STEAM_STORE_ART}/${app.appid}/header.jpg`,
    lastPlayed: app.lastPlayed,
    recentlyPlayed:
      app.lastPlayed !== null && now.getTime() - app.lastPlayed.getTime() <= RECENT_MS,
  }
}

async function familyGet(
  path: string,
  params: Readonly<Record<string, string>>,
  token: Secret,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await steamGet(path, { ...params, access_token: token.expose() }, { signal })
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'auth_expired') {
      throw new ProviderError('auth_expired', 'Steam: the family library session was rejected', {
        cause: error,
      })
    }
    throw error
  }
}
