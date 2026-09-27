import { z } from 'zod'
import { steamGet } from './api'
import { check } from './parse'

const STORE_ITEMS = '/IStoreBrowseService/GetItems/v1/'
const STORE_ASSETS = 'https://shared.akamai.steamstatic.com/store_item_assets/'
const BATCH = 50
const FOUND = 1
const FILENAME = '${FILENAME}'

const assetsSchema = z.object({
  response: z.object({
    store_items: z
      .array(
        z.object({
          id: z.number().int().positive(),
          success: z.number().int(),
          assets: z
            .object({
              asset_url_format: z.string().optional(),
              header: z.string().optional(),
              library_capsule: z.string().optional(),
              library_capsule_2x: z.string().optional(),
              library_hero: z.string().optional(),
            })
            .optional(),
        }),
      )
      .optional(),
  }),
})

export interface StoreArt {
  readonly header: string | null
  readonly portrait: string | null
  readonly hero: string | null
}

const NO_ART: StoreArt = { header: null, portrait: null, hero: null }

export async function fetchStoreArt(
  appids: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, StoreArt>> {
  const art = new Map<string, StoreArt>(appids.map((appid) => [appid, NO_ART]))
  for (let start = 0; start < appids.length; start += BATCH) {
    const input = {
      ids: appids.slice(start, start + BATCH).map((appid) => ({ appid: Number(appid) })),
      context: { language: 'english', country_code: 'US' },
      data_request: { include_assets: true },
    }
    const reply = check(
      assetsSchema,
      await steamGet(STORE_ITEMS, { input_json: JSON.stringify(input) }, { signal }),
      'store assets',
    )
    for (const item of reply.response.store_items ?? []) {
      const appid = String(item.id)
      if (item.success !== FOUND || !art.has(appid)) continue
      const format = item.assets?.asset_url_format
      art.set(appid, {
        header: headerUrl(format, item.assets?.header),
        portrait: headerUrl(
          format,
          item.assets?.library_capsule_2x ?? item.assets?.library_capsule,
        ),
        hero: headerUrl(format, item.assets?.library_hero),
      })
    }
  }
  return art
}

export function headerUrl(format: string | undefined, file: string | undefined): string | null {
  if (!format?.includes(FILENAME) || !file || !/^[\w./-]+$/.test(file) || file.includes('..')) {
    return null
  }
  return `${STORE_ASSETS}${format.replace(FILENAME, file)}`
}
