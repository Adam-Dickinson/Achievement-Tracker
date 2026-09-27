import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import {
  parseAchievementsPage,
  parseTitleHistory,
  toGameAchievements,
  type XboxAchievement,
} from './parse'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve('tests/fixtures/xbox', name), 'utf8'))
}

function parseErrorFrom(run: () => unknown): ProviderError {
  try {
    run()
  } catch (error) {
    if (error instanceof ProviderError) return error
    throw error
  }
  throw new Error('expected a ProviderError, but nothing was thrown')
}

const STORE = 'https://store-images.s-microsoft.com/image'
const FORZA_LAST_PLAYED = new Date('2026-06-03T19:26:12.592981Z')
const DAY_MS = 24 * 60 * 60 * 1000

function history(titles: readonly unknown[]): unknown {
  return { xuid: '2535400000000001', titles }
}

function title(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    titleId: '123',
    name: 'Test Game',
    displayImage: 'http://store-images.s-microsoft.com/image/display',
    images: [],
    titleHistory: { lastTimePlayed: '2026-06-01T00:00:00.0000000Z' },
    achievement: { sourceVersion: 2 },
    ...overrides,
  }
}

describe('parseTitleHistory', () => {
  const now = new Date(FORZA_LAST_PLAYED.getTime() + DAY_MS)

  it('keeps only titles with Xbox achievements (sourceVersion 2)', () => {
    const games = parseTitleHistory(fixture('titlehub-history.json'), now)

    expect(games.map((game) => game.title)).toEqual(['Forza Horizon 6', 'Lords of the Fallen'])
  })

  it('maps a title to a RemoteGame with https, resized art', () => {
    const [forza] = parseTitleHistory(fixture('titlehub-history.json'), now)

    expect(forza).toEqual({
      ref: { externalId: '2079757188' },
      title: 'Forza Horizon 6',
      iconUrl: `${STORE}/apps.47378.13758467164481545.c998f207-34a5-4a78-8843-178e2acdf371.a6be6fee-fc3c-4547-9b9a-478ba3fd0d81?w=128&h=128`,
      coverUrl: `${STORE}/apps.50642.13758467164481545.c998f207-34a5-4a78-8843-178e2acdf371.0073ed41-4cdf-4fbf-81f2-ba27e79fb5ab?w=920`,
      lastPlayed: FORZA_LAST_PLAYED,
      recentlyPlayed: true,
      storeUrl: 'https://www.xbox.com/games/store/_/9NR1R1XWLCNB',
    })
  })

  it('counts a game as recently played up to 14 days after it was last played', () => {
    const at = (days: number): boolean | undefined =>
      parseTitleHistory(
        fixture('titlehub-history.json'),
        new Date(FORZA_LAST_PLAYED.getTime() + days * DAY_MS),
      )[0]?.recentlyPlayed

    expect(at(14)).toBe(true)
    expect(at(14.01)).toBe(false)
  })

  it('does not count a title without play history as recent', () => {
    const [game] = parseTitleHistory(history([title({ titleHistory: null })]), now)

    expect(game?.lastPlayed).toBeNull()
    expect(game?.recentlyPlayed).toBe(false)
  })

  it('prefers TitledHeroArt, then SuperHeroArt, then BoxArt, then the display image for the cover', () => {
    const image = (type: string): { url: string; type: string } => ({
      url: `http://store-images.s-microsoft.com/image/${type}`,
      type,
    })
    const cover = (images: unknown[]): string | null | undefined =>
      parseTitleHistory(history([title({ images })]), now)[0]?.coverUrl

    expect(cover([image('BoxArt'), image('SuperHeroArt'), image('TitledHeroArt')])).toBe(
      `${STORE}/TitledHeroArt?w=920`,
    )
    expect(cover([image('Poster'), image('BoxArt'), image('SuperHeroArt')])).toBe(
      `${STORE}/SuperHeroArt?w=920`,
    )
    expect(cover([image('Poster'), image('BoxArt')])).toBe(`${STORE}/BoxArt?w=920`)
    expect(cover([image('Poster')])).toBe(`${STORE}/display?w=920`)
  })

  it('has no art when the title has no images and no display image', () => {
    const [game] = parseTitleHistory(history([title({ images: null, displayImage: null })]), now)

    expect(game?.iconUrl).toBeNull()
    expect(game?.coverUrl).toBeNull()
  })

  it('switches other hosts to https without adding size parameters', () => {
    const displayImage = 'http://images-eds-ssl.xboxlive.com/image?url=abc'
    const [game] = parseTitleHistory(history([title({ displayImage })]), now)

    expect(game?.iconUrl).toBe('https://images-eds-ssl.xboxlive.com/image?url=abc')
  })

  it('drops an image URL that cannot be parsed', () => {
    const [game] = parseTitleHistory(history([title({ displayImage: 'not a url' })]), now)

    expect(game?.iconUrl).toBeNull()
  })

  it('accepts titles whose optional fields are missing', () => {
    const bare = { titleId: '5', name: 'Bare', achievement: { sourceVersion: 2 } }

    expect(parseTitleHistory(history([bare]), now)).toEqual([
      {
        ref: { externalId: '5' },
        title: 'Bare',
        iconUrl: null,
        coverUrl: null,
        lastPlayed: null,
        recentlyPlayed: false,
        storeUrl: null,
      },
    ])
  })

  it('links the Xbox store page of the first well-formed product id', () => {
    const store = (availabilities: unknown): string | null | undefined =>
      parseTitleHistory(history([title({ detail: { availabilities } })]), now)[0]?.storeUrl

    expect(store([{ ProductId: '9n3cjz3hfhtf' }])).toBe(
      'https://www.xbox.com/games/store/_/9N3CJZ3HFHTF',
    )
    expect(store([{ ProductId: null }, { ProductId: 'BRRC2BP0G9P0' }])).toBe(
      'https://www.xbox.com/games/store/_/BRRC2BP0G9P0',
    )
    expect(store([{ ProductId: '../../evil' }])).toBeNull()
    expect(store([{ ProductId: '' }])).toBeNull()
    expect(store([])).toBeNull()
    expect(store(null)).toBeNull()
  })

  it('skips titles with no achievement summary', () => {
    expect(parseTitleHistory(history([title({ achievement: null })]), now)).toEqual([])
  })

  it('throws a parse error when the reply has no titles list', () => {
    const error = parseErrorFrom(() => parseTitleHistory({ xuid: '1' }, now))

    expect(error.kind).toBe('parse')
    expect(error.message).toContain('Xbox: unexpected title history response')
  })

  it('throws a parse error for a title id that is not all digits', () => {
    expect(
      parseErrorFrom(() => parseTitleHistory(history([title({ titleId: 'abc' })]), now)).kind,
    ).toBe('parse')
  })

  it('throws a parse error for a malformed last-played date', () => {
    const titleHistory = { lastTimePlayed: 'yesterday' }

    expect(
      parseErrorFrom(() => parseTitleHistory(history([title({ titleHistory })]), now)).kind,
    ).toBe('parse')
  })
})

function achievement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '7',
    name: 'Test Achievement',
    description: 'Do the thing',
    isSecret: false,
    progressState: 'Achieved',
    progression: { timeUnlocked: '2026-01-02T03:04:05.0000000Z' },
    mediaAssets: [
      { name: 'icon', type: 'Icon', url: 'https://images-eds-ssl.xboxlive.com/image?url=x' },
    ],
    rewards: [{ type: 'Gamerscore', value: '20', valueType: 'Int' }],
    rarity: { currentCategory: 'Rare', currentPercentage: 5.5 },
    ...overrides,
  }
}

function page(achievements: readonly unknown[], continuationToken: string | null = null): unknown {
  return { achievements, pagingInfo: { continuationToken, totalRecords: achievements.length } }
}

function mapped(overrides: Record<string, unknown> = {}): ReturnType<typeof toGameAchievements> {
  return toGameAchievements(parseAchievementsPage(page([achievement(overrides)])).achievements)
}

describe('parseAchievementsPage', () => {
  it('reads the achievements and the continuation token of a page', () => {
    const first = parseAchievementsPage(fixture('achievements-2079757188-page1.json'))

    expect(first.achievements.map((a) => a.id)).toEqual(['1', '2'])
    expect(first.continuationToken).toBe('32')
  })

  it('gives a null continuation token on the last page', () => {
    const last = parseAchievementsPage(fixture('achievements-2079757188-page2.json'))

    expect(last.achievements.map((a) => a.id)).toEqual(['33', '34'])
    expect(last.continuationToken).toBeNull()
  })

  it('accepts the empty reply a wrong contract version gives', () => {
    expect(parseAchievementsPage(fixture('achievements-empty.json'))).toEqual({
      achievements: [],
      continuationToken: null,
    })
  })

  it('throws a parse error when the reply has no paging info', () => {
    const error = parseErrorFrom(() => parseAchievementsPage({ achievements: [] }))

    expect(error.kind).toBe('parse')
    expect(error.message).toContain('Xbox: unexpected achievements response')
  })

  it('throws a parse error for an achievement without an id', () => {
    expect(parseErrorFrom(() => parseAchievementsPage(page([achievement({ id: '' })]))).kind).toBe(
      'parse',
    )
  })

  it('throws a parse error for a rarity outside 0-100', () => {
    const rarity = { currentPercentage: 140 }

    expect(parseErrorFrom(() => parseAchievementsPage(page([achievement({ rarity })]))).kind).toBe(
      'parse',
    )
  })
})

describe('toGameAchievements', () => {
  const list = (): readonly XboxAchievement[] =>
    parseAchievementsPage(fixture('achievements-2001700854.json')).achievements

  it('lists every achievement, locked or not', () => {
    expect(toGameAchievements(list()).achievements.map((a) => a.externalId)).toEqual([
      '66',
      '90',
      '86',
      '32',
      '1',
    ])
  })

  it('maps an achievement from the real reply', () => {
    const [first] = toGameAchievements(list()).achievements

    expect(first).toEqual({
      externalId: '66',
      name: 'BO6 - Unexpected Move',
      description: 'Complete Bishop Takes Rook in Campaign on any difficulty',
      iconUrl:
        'https://images-eds-ssl.xboxlive.com/image?url=27S1DHqE.cHkmFg4nspsd8RT4HM1altJX9qByHnuXHZ3U9rbp6acA_QEsXdEAI4G2ZB5zu9ANrFwt9xfWAYxRtwBpmgrh9j6vWreqwE5BN.CkC.htLv2AybJbXED9LuarIvfEKipUbwhNZ68GUXmrA--',
      iconLockedUrl: null,
      hidden: false,
      points: 15,
      tier: null,
      globalPercent: 11.78,
    })
  })

  it('turns only Achieved achievements into unlocks, never InProgress ones', () => {
    expect(toGameAchievements(list()).unlocks).toEqual([
      {
        achievementExternalId: '66',
        unlockedAt: new Date('2024-11-07T15:36:46.843Z'),
        progress: null,
      },
      {
        achievementExternalId: '90',
        unlockedAt: new Date('2024-11-18T16:05:21.213Z'),
        progress: null,
      },
    ])
  })

  it('marks secret achievements as hidden and keeps their rarity', () => {
    const secret = toGameAchievements(list()).achievements.find((a) => a.externalId === '32')

    expect(secret?.hidden).toBe(true)
    expect(secret?.globalPercent).toBe(1.78)
  })

  it('maps the year-1 "never" time to null for an Achieved achievement', () => {
    const { unlocks } = mapped({ progression: { timeUnlocked: '0001-01-01T00:00:00.0000000Z' } })

    expect(unlocks).toEqual([{ achievementExternalId: '7', unlockedAt: null, progress: null }])
  })

  it('treats an unknown progress state as not unlocked', () => {
    const { achievements, unlocks } = mapped({ progressState: 'Unknown' })

    expect(achievements).toHaveLength(1)
    expect(unlocks).toEqual([])
  })

  it('has no rarity when the reply has none (contract version 2)', () => {
    expect(mapped({ rarity: undefined }).achievements[0]?.globalPercent).toBeNull()
  })

  it('reads gamerscore only from the Gamerscore reward', () => {
    const rewards = [
      { type: 'Art', value: 'poster' },
      { type: 'Gamerscore', value: '45' },
    ]

    expect(mapped({ rewards }).achievements[0]?.points).toBe(45)
  })

  it('has no points when there is no whole-number Gamerscore reward', () => {
    const points = (rewards: unknown): number | null | undefined =>
      mapped({ rewards }).achievements[0]?.points

    expect(points(null)).toBeNull()
    expect(points([{ type: 'Art', value: '10' }])).toBeNull()
    expect(points([{ type: 'Gamerscore', value: '' }])).toBeNull()
    expect(points([{ type: 'Gamerscore', value: 'ten' }])).toBeNull()
    expect(points([{ type: 'Gamerscore', value: '2.5' }])).toBeNull()
    expect(points([{ type: 'Gamerscore', value: '-5' }])).toBeNull()
  })

  it('maps an empty description to null', () => {
    expect(mapped({ description: '' }).achievements[0]?.description).toBeNull()
  })

  it('has no icon when the achievement has no Icon asset', () => {
    const mediaAssets = [{ type: 'Screenshot', url: 'https://images-eds-ssl.xboxlive.com/s' }]

    expect(mapped({ mediaAssets }).achievements[0]?.iconUrl).toBeNull()
  })

  it('switches an http icon to https', () => {
    const mediaAssets = [{ type: 'Icon', url: 'http://images-eds-ssl.xboxlive.com/image?url=y' }]

    expect(mapped({ mediaAssets }).achievements[0]?.iconUrl).toBe(
      'https://images-eds-ssl.xboxlive.com/image?url=y',
    )
  })

  it('returns nothing for a game with no achievements', () => {
    expect(toGameAchievements([])).toEqual({ achievements: [], unlocks: [] })
  })
})
