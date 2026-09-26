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
            })
            .optional(),
        }),
      )
      .optional(),
  }),
})

export async function fetchHeaderImages(
  appids: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, string | null>> {
  const headers = new Map<string, string | null>(appids.map((appid) => [appid, null]))
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
      if (item.success !== FOUND || !headers.has(appid)) continue
      headers.set(appid, headerUrl(item.assets?.asset_url_format, item.assets?.header))
    }
  }
  return headers
}

export function headerUrl(format: string | undefined, file: string | undefined): string | null {
  if (!format?.includes(FILENAME) || !file || !/^[\w./-]+$/.test(file) || file.includes('..')) {
    return null
  }
  return `${STORE_ASSETS}${format.replace(FILENAME, file)}`
}
