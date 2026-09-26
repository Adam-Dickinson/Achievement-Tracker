import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Platform } from '@shared/platform'
import { InMemorySecretStore } from '@shared/secret-store'
import { Secret } from '@shared/secret'
import { applyMigrations } from '../store/migrate'
import { listLibraryGames } from '../store/library-store'
import { addPlatformGames, upsertAccount } from '../store/sync-store'
import { ARTWORK_SECRET, ArtworkService, RETRY_AFTER_MS } from './artwork-service'

const NOW = new Date('2026-09-26T12:00:00.000Z')
const DAY = 24 * 60 * 60_000

let db: DatabaseSync
let secrets: InMemorySecretStore
let now: Date
const onFound = vi.fn()
const fetchMock = vi.fn<typeof fetch>()

interface FakeGame {
  readonly id: number
  readonly name: string
  readonly thumb?: string
}

let catalogue: FakeGame[] = []
let refuseKey = false
let offline = false

function answer(url: URL): Response {
  if (offline) throw new TypeError('fetch failed')
  if (refuseKey)
    return new Response('{"success":false,"errors":["Invalid API key"]}', { status: 401 })
  const search = /\/search\/autocomplete\/(.+)$/.exec(url.pathname)
  if (search?.[1]) {
    const term = decodeURIComponent(search[1]).toLowerCase()
    const data = catalogue.filter((game) => game.name.toLowerCase().includes(term.slice(0, 5)))
    return Response.json({ success: true, data: data.map(({ id, name }) => ({ id, name })) })
  }
  const grids = /\/grids\/game\/(\d+)$/.exec(url.pathname)
  const game = catalogue.find((g) => String(g.id) === grids?.[1])
  if (!game) return Response.json({ success: false, errors: ['Game not found'] }, { status: 404 })
  const data = game.thumb
    ? [{ id: 1, style: 'alternate', width: 920, height: 430, thumb: game.thumb }]
    : []
  return Response.json({ success: true, data })
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  applyMigrations(db)
  secrets = new InMemorySecretStore()
  secrets.save(ARTWORK_SECRET, new Secret('0123456789abcdef0123456789abcdef'))
  now = NOW
  catalogue = [
    { id: 10, name: 'Death Stranding', thumb: 'https://cdn2.steamgriddb.com/thumb/ds.jpg' },
    { id: 11, name: 'Europa Universalis IV', thumb: 'https://cdn2.steamgriddb.com/thumb/eu4.jpg' },
    { id: 12, name: 'Georgie-Yolkie' },
  ]
  refuseKey = false
  offline = false
  fetchMock.mockImplementation((input) => Promise.resolve(answer(new URL(String(input)))))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  onFound.mockReset()
  vi.unstubAllGlobals()
})

function service(): ArtworkService {
  return new ArtworkService({ db, secrets, onFound, now: () => now, pauseMs: 0 })
}

function add(
  externalId: string,
  title: string,
  coverUrl: string | null = null,
  platform: Platform = 'epic',
): void {
  const account = upsertAccount(db, { platform, externalId: `${platform}-1`, displayName: 'Test' })
  addPlatformGames(db, account, [
    {
      ref: { externalId },
      title,
      iconUrl: null,
      coverUrl,
      lastPlayed: null,
      recentlyPlayed: false,
    },
  ])
}

function coverOf(title: string): string | null {
  return listLibraryGames(db).find((game) => game.title === title)?.coverUrl ?? null
}

describe('ArtworkService', () => {
  it('finds art for games that have none, and the Library shows it', async () => {
    add('a', 'Death Stranding')
    add('b', 'Europa Universalis IV')
    add('c', 'Portal', 'https://store/portal.jpg')

    expect(await service().run()).toEqual({ found: 2, checked: 2 })

    expect(coverOf('Death Stranding')).toBe('https://cdn2.steamgriddb.com/thumb/ds.jpg')
    expect(coverOf('Europa Universalis IV')).toBe('https://cdn2.steamgriddb.com/thumb/eu4.jpg')
    expect(coverOf('Portal')).toBe('https://store/portal.jpg')
    expect(onFound).toHaveBeenCalledOnce()
  })

  it('never takes a near miss, and asks again only after 30 days', async () => {
    add('y', 'yorkie Production')

    expect(await service().run()).toEqual({ found: 0, checked: 1 })
    expect(coverOf('yorkie Production')).toBeNull()
    expect(onFound).not.toHaveBeenCalled()

    now = new Date(NOW.getTime() + 29 * DAY)
    expect(await service().run()).toEqual({ found: 0, checked: 0 })

    now = new Date(NOW.getTime() + RETRY_AFTER_MS + DAY)
    expect(await service().run()).toEqual({ found: 0, checked: 1 })
  })

  it('does not ask again for art it already found', async () => {
    add('a', 'Death Stranding')
    await service().run()
    fetchMock.mockClear()

    now = new Date(NOW.getTime() + RETRY_AFTER_MS + DAY)
    expect(await service().run()).toEqual({ found: 0, checked: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps art found for a title when the game is linked or unlinked', async () => {
    add('a', 'Death Stranding')
    await service().run()

    add('ps', 'DEATH STRANDING™', null, 'playstation')

    expect(listLibraryGames(db).find((g) => g.platforms.length === 2)?.coverUrl).toBe(
      'https://cdn2.steamgriddb.com/thumb/ds.jpg',
    )
  })

  it('does nothing without a key', async () => {
    secrets.delete(ARTWORK_SECRET)
    add('a', 'Death Stranding')

    expect(await service().run()).toEqual({ found: 0, checked: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops and reports a refused key, remembering nothing', async () => {
    add('a', 'Death Stranding')
    add('b', 'Europa Universalis IV')
    refuseKey = true
    const artwork = service()

    expect(await artwork.run()).toEqual({ found: 0, checked: 0 })
    expect(artwork.problem).toBe('key_refused')
    expect(fetchMock).toHaveBeenCalledOnce()

    refuseKey = false
    expect(await artwork.run()).toEqual({ found: 2, checked: 2 })
    expect(artwork.problem).toBeNull()
  })

  it('stops and reports when SteamGridDB cannot be reached', async () => {
    add('a', 'Death Stranding')
    offline = true
    const artwork = service()

    await artwork.run()

    expect(artwork.problem).toBe('unreachable')
  })

  it('runs once at a time', async () => {
    add('a', 'Death Stranding')
    const artwork = service()

    const [first, second] = await Promise.all([artwork.run(), artwork.run()])

    expect(first).toEqual({ found: 1, checked: 1 })
    expect(second).toBe(first)
  })

  describe('saveKey', () => {
    it('checks a new key with SteamGridDB, saves it and looks for art', async () => {
      secrets.delete(ARTWORK_SECRET)
      add('a', 'Death Stranding')
      const artwork = service()

      expect(await artwork.saveKey('fedcba9876543210fedcba9876543210')).toEqual({ ok: true })

      expect(secrets.find(ARTWORK_SECRET)?.expose()).toBe('fedcba9876543210fedcba9876543210')
      expect(artwork.hasKey()).toBe(true)
      await vi.waitFor(() => expect(coverOf('Death Stranding')).not.toBeNull())
    })

    it('keeps a refused key out of the store', async () => {
      secrets.delete(ARTWORK_SECRET)
      refuseKey = true

      expect(await service().saveKey('fedcba9876543210fedcba9876543210')).toEqual({
        ok: false,
        reason: 'key_rejected',
        message: 'SteamGridDB refused that key. Check it and try again.',
      })
      expect(secrets.find(ARTWORK_SECRET)).toBeUndefined()
    })

    it('says so when SteamGridDB cannot be reached', async () => {
      offline = true

      expect(await service().saveKey('fedcba9876543210fedcba9876543210')).toMatchObject({
        ok: false,
        reason: 'network',
      })
    })
  })

  it('removes the key and clears the last problem', async () => {
    add('a', 'Death Stranding')
    refuseKey = true
    const artwork = service()
    await artwork.run()

    artwork.removeKey()

    expect(artwork.hasKey()).toBe(false)
    expect(artwork.problem).toBeNull()
  })
})
