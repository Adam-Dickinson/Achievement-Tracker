import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStoreArt, headerUrl } from './store-assets'

const fetchMock = vi.fn<typeof fetch>()
const JSON_REPLY = { headers: { 'content-type': 'application/json' } }

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function fixture(): string {
  return readFileSync(resolve('tests/fixtures/steam/store-assets.json'), 'utf8')
}

function requestedInputs(): { ids: { appid: number }[]; data_request: unknown }[] {
  return fetchMock.mock.calls.map(([url]) =>
    JSON.parse(new URL(String(url)).searchParams.get('input_json') ?? '{}'),
  )
}

describe('fetchStoreArt', () => {
  it("builds each game's header, tall library capsule and library hero from Steam's store assets", async () => {
    fetchMock.mockResolvedValueOnce(new Response(fixture(), JSON_REPLY))

    const art = await fetchStoreArt(['2584270', '236850', '700580'])

    expect(art).toEqual(
      new Map([
        [
          '2584270',
          {
            header:
              'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2584270/0a4c23b70ced29fac344186ea564dae67c80cfd6/header.jpg?t=1788251111',
            portrait:
              'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2584270/e92804cbd8a37fbf08e19c55ab6a0ce7f0f25bf5/library_capsule_2x.jpg?t=1788251111',
            hero: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2584270/6797ef35ca25b0f2876c8a16bc5f8deffa19dbe1/library_hero.jpg?t=1788251111',
          },
        ],
        [
          '236850',
          {
            header:
              'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/236850/header.jpg?t=1778249292',
            portrait:
              'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/236850/262929c03990b786390232599f3af566ae36eac7/library_600x900_2x.jpg?t=1778249292',
            hero: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/236850/e9ca126009c5fecf7df6e2782c69a4d3336fcc32/library_hero.jpg?t=1778249292',
          },
        ],
        ['700580', { header: null, portrait: null, hero: null }],
      ]),
    )
    const [input] = requestedInputs()
    expect(input?.data_request).toEqual({ include_assets: true })
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      '/IStoreBrowseService/GetItems/v1/',
    )
  })

  it('asks for 50 games at a time', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response('{"response":{"store_items":[]}}', JSON_REPLY)),
    )
    const appids = Array.from({ length: 120 }, (_, i) => String(i + 1))

    const art = await fetchStoreArt(appids)

    expect(requestedInputs().map((input) => input.ids.length)).toEqual([50, 50, 20])
    expect(art.size).toBe(120)
  })

  it('makes no request for an empty list', async () => {
    expect(await fetchStoreArt([])).toEqual(new Map())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the 1x library capsule when there is no 2x one', async () => {
    const reply = {
      response: {
        store_items: [
          {
            id: 1,
            success: 1,
            assets: { asset_url_format: 'steam/apps/1/${FILENAME}', library_capsule: 'cap.jpg' },
          },
        ],
      },
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(reply), JSON_REPLY))

    expect((await fetchStoreArt(['1'])).get('1')).toEqual({
      header: null,
      portrait: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1/cap.jpg',
      hero: null,
    })
  })
})

describe('headerUrl', () => {
  it('fills the file into the format', () => {
    expect(headerUrl('steam/apps/1/${FILENAME}?t=2', 'abc/header.jpg')).toBe(
      'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1/abc/header.jpg?t=2',
    )
  })

  it.each([
    [undefined, 'header.jpg'],
    ['steam/apps/1/header.jpg', 'header.jpg'],
    ['steam/apps/1/${FILENAME}', undefined],
    ['steam/apps/1/${FILENAME}', '../../evil.jpg'],
    ['steam/apps/1/${FILENAME}', 'a b.jpg'],
  ])('gives nothing for format %s and file %s', (format, file) => {
    expect(headerUrl(format, file)).toBeNull()
  })
})
