import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchHeaderImages, headerUrl } from './store-assets'

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

describe('fetchHeaderImages', () => {
  it("builds each game's current header image from Steam's store assets", async () => {
    fetchMock.mockResolvedValueOnce(new Response(fixture(), JSON_REPLY))

    const headers = await fetchHeaderImages(['2584270', '236850', '700580'])

    expect(headers).toEqual(
      new Map([
        [
          '2584270',
          'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2584270/0a4c23b70ced29fac344186ea564dae67c80cfd6/header.jpg?t=1788251111',
        ],
        [
          '236850',
          'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/236850/header.jpg?t=1778249292',
        ],
        ['700580', null],
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

    const headers = await fetchHeaderImages(appids)

    expect(requestedInputs().map((input) => input.ids.length)).toEqual([50, 50, 20])
    expect(headers.size).toBe(120)
  })

  it('makes no request for an empty list', async () => {
    expect(await fetchHeaderImages([])).toEqual(new Map())
    expect(fetchMock).not.toHaveBeenCalled()
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
