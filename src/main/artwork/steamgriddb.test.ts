import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { listGrids, pickGame, pickGrid, type SgdbGrid, searchGames } from './steamgriddb'

const KEY = new Secret('0123456789abcdef0123456789abcdef')

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/steamgriddb', name), 'utf8')
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function reply(body: string, status = 200, headers: Record<string, string> = {}): void {
  fetchMock.mockResolvedValueOnce(new Response(body, { status, headers }))
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

function grid(overrides: Partial<SgdbGrid> = {}): SgdbGrid {
  return {
    id: 1,
    style: 'alternate',
    width: 920,
    height: 430,
    thumb: 'https://cdn2.steamgriddb.com/thumb/1.jpg',
    upvotes: 0,
    downvotes: 0,
    nsfw: false,
    humor: false,
    epilepsy: false,
    ...overrides,
  }
}

describe('searchGames', () => {
  it('searches by name with the key, without trademark signs', async () => {
    reply(fixture('search-death-stranding.json'))

    const games = await searchGames('DEATH STRANDING™', KEY)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://www.steamgriddb.com/api/v2/search/autocomplete/DEATH%20STRANDING')
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${KEY.expose()}` })
    expect(games.slice(0, 2)).toEqual([
      expect.objectContaining({ id: 5250432, name: 'Death Stranding' }),
      expect.objectContaining({ id: 5293743, name: "Death Stranding Director's Cut" }),
    ])
  })

  it('reports a refused key as auth_expired', async () => {
    reply(fixture('error-bad-key.json'), 401)

    expect((await errorFrom(searchGames('Portal', KEY))).kind).toBe('auth_expired')
  })

  it('reports 429 as rate_limited, and a server error or no connection as retryable', async () => {
    reply('{}', 429, { 'Retry-After': '60' })
    const limited = await errorFrom(searchGames('Portal', KEY))
    expect([limited.kind, limited.retryAfterMs]).toEqual(['rate_limited', 60_000])

    reply('{}', 502)
    expect((await errorFrom(searchGames('Portal', KEY))).isRetryable).toBe(true)

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await errorFrom(searchGames('Portal', KEY))).kind).toBe('network')
  })

  it('reports a malformed reply as a parse error', async () => {
    reply('{"success":true,"data":[{"name":"No id"}]}')

    expect((await errorFrom(searchGames('Portal', KEY))).kind).toBe('parse')
  })
})

describe('listGrids', () => {
  it('asks for static landscape grids without NSFW, humour or flashing images', async () => {
    reply(fixture('grids-death-stranding.json'))

    const grids = await listGrids(5250432, KEY)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://www.steamgriddb.com/api/v2/grids/game/5250432?dimensions=920x430,460x215&types=static&nsfw=false&humor=false&epilepsy=false',
    )
    expect(grids).toHaveLength(6)
    expect(grids[0]).toMatchObject({ width: 920, height: 430, style: 'alternate' })
  })

  it('answers no grids for a game SteamGridDB does not know', async () => {
    reply(fixture('error-not-found.json'), 404)

    expect(await listGrids(999999999, KEY)).toEqual([])
  })
})

describe('pickGame', () => {
  const games = [
    { id: 1, name: 'Death Stranding 2: On The Beach' },
    { id: 2, name: "Death Stranding Director's Cut" },
    { id: 3, name: 'Death Stranding' },
  ]

  it('takes only a game whose cleaned title is the same', () => {
    expect(pickGame(games, 'DEATH STRANDING™')?.id).toBe(3)
    expect(
      pickGame(
        [{ id: 4, name: "Assassin's Creed IV: Black Flag" }],
        'Assassin’s Creed® IV Black Flag',
      )?.id,
    ).toBe(4)
  })

  it('takes nothing rather than a near miss', () => {
    expect(pickGame([{ id: 5, name: 'Georgie-Yolkie' }], 'yorkie Production')).toBeNull()
    expect(pickGame(games.slice(0, 2), 'Death Stranding')).toBeNull()
    expect(pickGame(games, '™')).toBeNull()
  })
})

describe('pickGrid', () => {
  it('prefers the best voted, then the alternate style, then the larger image', () => {
    expect(
      pickGrid([
        grid({ id: 1, thumb: 'https://x/1.jpg', style: 'white_logo' }),
        grid({ id: 2, thumb: 'https://x/2.jpg', upvotes: 3 }),
      ]),
    ).toBe('https://x/2.jpg')
    expect(
      pickGrid([
        grid({ id: 1, thumb: 'https://x/1.jpg', style: 'material' }),
        grid({ id: 2, thumb: 'https://x/2.jpg', width: 460, height: 215 }),
        grid({ id: 3, thumb: 'https://x/3.jpg' }),
      ]),
    ).toBe('https://x/3.jpg')
  })

  it('skips NSFW, humour, flashing and non-https images, and answers null when none is left', () => {
    expect(
      pickGrid([
        grid({ nsfw: true }),
        grid({ humor: true }),
        grid({ epilepsy: true }),
        grid({ thumb: 'http://x/1.jpg' }),
      ]),
    ).toBeNull()
    expect(pickGrid([])).toBeNull()
  })
})
