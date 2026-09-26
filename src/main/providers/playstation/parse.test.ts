import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import {
  gameExternalId,
  parseAccountId,
  parseGameExternalId,
  parseLibrary,
  parseOnlineId,
  parseTrophies,
} from './parse'

const NOW = new Date('2026-09-25T17:00:00.000Z')

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve('tests/fixtures/playstation', name), 'utf8'))
}

function thrown(run: () => unknown): ProviderError {
  try {
    run()
  } catch (error) {
    if (error instanceof ProviderError) return error
    throw error
  }
  throw new Error('expected a ProviderError')
}

function title(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    npServiceName: 'trophy',
    npCommunicationId: 'NPWR00001_00',
    trophyTitleName: 'Example',
    trophyTitlePlatform: 'PS4',
    trophyTitleIconUrl: 'https://image.api.playstation.com/example.png',
    lastUpdatedDateTime: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('parseAccountId', () => {
  it('reads the account id from the trophy summary', () => {
    expect(parseAccountId(fixture('trophy-summary.json'))).toBe('1234567890123456789')
  })

  it('rejects a summary without a numeric account id as a parse error', () => {
    expect(thrown(() => parseAccountId({ accountId: 'me' })).kind).toBe('parse')
  })
})

describe('parseOnlineId', () => {
  it('reads the online id from the profile', () => {
    expect(parseOnlineId(fixture('profile.json'))).toBe('ExamplePlayer')
  })

  it('leaves the name empty when the profile has none', () => {
    expect(parseOnlineId({ onlineId: ' ' })).toBeNull()
    expect(parseOnlineId({})).toBeNull()
  })
})

describe('game external ids', () => {
  it('keeps the trophy service with the trophy set id so a game can be fetched later', () => {
    const set = { service: 'trophy2', id: 'NPWR37356_00' }

    expect(gameExternalId(set)).toBe('trophy2/NPWR37356_00')
    expect(parseGameExternalId('trophy2/NPWR37356_00')).toEqual(set)
  })

  it.each(['NPWR37356_00', 'trophy2/', 'trophy2/NPWR/00', 'Trophy/NPWR1', '../x'])(
    'rejects %s',
    (externalId) => {
      expect(thrown(() => parseGameExternalId(externalId)).kind).toBe('other')
    },
  )
})

describe('parseLibrary', () => {
  it('lists every trophy set as a game, with its art as icon and cover', () => {
    const games = parseLibrary([fixture('trophy-titles.json')], NOW)

    expect(games).toHaveLength(9)
    expect(games[0]).toEqual({
      ref: { externalId: 'trophy/NPWR27620_00' },
      title: 'Gran Turismo 7',
      iconUrl: expect.stringMatching(/^https:\/\/image\.api\.playstation\.com\/trophy\/np\//),
      coverUrl: expect.stringMatching(/^https:\/\/image\.api\.playstation\.com\/trophy\/np\//),
      lastPlayed: new Date('2026-09-08T14:35:55Z'),
      recentlyPlayed: false,
    })
    expect(games.find((game) => game.title === 'Stellar Blade')?.ref.externalId).toBe(
      'trophy2/NPWR37356_00',
    )
  })

  it('names the platform only when two trophy sets share a name', () => {
    const titles = parseLibrary([fixture('trophy-titles.json')], NOW).map((game) => game.title)

    expect(titles).toContain('God of War Ragnarök (PS4)')
    expect(titles).toContain('God of War Ragnarök (PS5 / PC)')
    expect(titles).toContain('Destiny')
    expect(titles).toContain('Terraria')
  })

  it('drops the "Trophy Set" that some PS3 lists add to the name', () => {
    const titles = parseLibrary([fixture('trophy-titles.json')], NOW).map((game) => game.title)

    expect(titles).toContain('Happy Feet Two')
    expect(
      parseLibrary([{ trophyTitles: [title({ trophyTitleName: 'Trophy Set' })] }], NOW)[0]?.title,
    ).toBe('Trophy Set')
  })

  it('counts a game as recently played only when its trophies changed in the last two weeks', () => {
    const games = parseLibrary(
      [
        {
          trophyTitles: [
            title({
              npCommunicationId: 'NPWR00001_00',
              lastUpdatedDateTime: '2026-09-12T00:00:00Z',
            }),
            title({
              npCommunicationId: 'NPWR00002_00',
              lastUpdatedDateTime: '2026-09-01T00:00:00Z',
            }),
            title({ npCommunicationId: 'NPWR00003_00', lastUpdatedDateTime: null }),
          ],
        },
      ],
      NOW,
    )

    expect(games.map((game) => game.recentlyPlayed)).toEqual([true, false, false])
    expect(games[2]?.lastPlayed).toBeNull()
  })

  it('joins the pages of a long list', () => {
    const games = parseLibrary(
      [
        { trophyTitles: [title({ npCommunicationId: 'NPWR00001_00' })] },
        { trophyTitles: [title({ npCommunicationId: 'NPWR00002_00', trophyTitleName: 'Other' })] },
      ],
      NOW,
    )

    expect(games.map((game) => game.ref.externalId)).toEqual([
      'trophy/NPWR00001_00',
      'trophy/NPWR00002_00',
    ])
  })

  it('leaves out art that is not served over https', () => {
    const [game] = parseLibrary(
      [{ trophyTitles: [title({ trophyTitleIconUrl: 'http://example.com/a.png' })] }],
      NOW,
    )

    expect(game?.coverUrl).toBeNull()
    expect(game?.iconUrl).toBeNull()
  })

  it('rejects a list without trophy titles as a parse error', () => {
    expect(thrown(() => parseLibrary([{ error: {} }], NOW)).kind).toBe('parse')
  })
})

describe('parseTrophies', () => {
  const ps5 = (): ReturnType<typeof parseTrophies> =>
    parseTrophies([fixture('title-trophies-ps5.json')], [fixture('user-trophies-ps5.json')])

  it('maps every trophy with its tier and global rarity', () => {
    const { achievements } = ps5()

    expect(achievements).toHaveLength(45)
    expect(achievements[0]).toEqual({
      externalId: '0',
      name: 'EVE Protocol',
      description: 'Acquired all trophies.',
      iconUrl: expect.stringMatching(/^https:\/\/psnobj\.prod\.dl\.playstation\.net\//),
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: 'platinum',
      globalPercent: 9.4,
    })
  })

  it('keeps the name and description of hidden trophies and marks them hidden', () => {
    const abaddon = ps5().achievements.find((achievement) => achievement.externalId === '2')

    expect(abaddon).toMatchObject({
      name: 'Abaddon',
      description: 'Defeated Abaddon.',
      hidden: true,
    })
  })

  it('records an unlock with its date for every earned trophy only', () => {
    const { unlocks } = ps5()

    expect(unlocks).toHaveLength(39)
    expect(unlocks).toContainEqual({
      achievementExternalId: '1',
      unlockedAt: new Date('2026-06-16T15:48:51Z'),
      progress: null,
    })
    expect(unlocks.some((unlock) => unlock.achievementExternalId === '0')).toBe(false)
  })

  it('reads a PS4 set with more than one trophy group', () => {
    const { achievements, unlocks } = parseTrophies(
      [fixture('title-trophies-ps4.json')],
      [fixture('user-trophies-ps4.json')],
    )

    expect(achievements).toHaveLength(48)
    expect(unlocks).toHaveLength(47)
  })

  it('falls back when a trophy has no name, an unknown tier or no rarity', () => {
    const { achievements, unlocks } = parseTrophies(
      [{ trophies: [{ trophyId: 7, trophyType: 'diamond' }] }],
      [{ trophies: [{ trophyId: 7, earned: true, trophyEarnedRate: 'n/a' }] }],
    )

    expect(achievements[0]).toMatchObject({
      name: 'Trophy 7',
      description: null,
      iconUrl: null,
      hidden: false,
      tier: null,
      globalPercent: null,
    })
    expect(unlocks).toEqual([{ achievementExternalId: '7', unlockedAt: null, progress: null }])
  })

  it('joins the pages of a long trophy list', () => {
    const { achievements, unlocks } = parseTrophies(
      [
        { trophies: [{ trophyId: 0, trophyName: 'Zero' }] },
        { trophies: [{ trophyId: 1, trophyName: 'One' }] },
      ],
      [
        { trophies: [{ trophyId: 0, earned: false }] },
        { trophies: [{ trophyId: 1, earned: true, earnedDateTime: '2026-01-01T00:00:00Z' }] },
      ],
    )

    expect(achievements.map((achievement) => achievement.name)).toEqual(['Zero', 'One'])
    expect(unlocks.map((unlock) => unlock.achievementExternalId)).toEqual(['1'])
  })

  it('ignores earned trophies the set does not define', () => {
    const { unlocks } = parseTrophies(
      [{ trophies: [{ trophyId: 1, trophyName: 'One' }] }],
      [{ trophies: [{ trophyId: 9, earned: true, earnedDateTime: '2026-01-01T00:00:00Z' }] }],
    )

    expect(unlocks).toEqual([])
  })

  it('rejects malformed replies as parse errors', () => {
    const title = [fixture('title-trophies-ps5.json')]
    const user = [fixture('user-trophies-ps5.json')]

    expect(thrown(() => parseTrophies([{}], user)).kind).toBe('parse')
    expect(thrown(() => parseTrophies(title, [{ trophies: [{ trophyId: 1 }] }])).kind).toBe('parse')
  })
})
