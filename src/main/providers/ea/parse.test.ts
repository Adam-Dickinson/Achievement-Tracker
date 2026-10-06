import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { parseAchievements, parseIdentity, parseLibrary, parseOwned } from './parse'

const NOW = new Date('2026-09-25T17:00:00.000Z')
const JEDI = '75158_196485_50844'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve('tests/fixtures/ea', name), 'utf8'))
}

function data(name: string): unknown {
  return (fixture(name) as { data: unknown }).data
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

describe('parseIdentity', () => {
  it('reads the account id, the persona id the achievements service needs, and the name', () => {
    expect(parseIdentity(data('me.json'))).toEqual({
      accountId: '1000000000001',
      personaId: '1000000002',
      displayName: 'TrophyTester',
    })
  })

  it('leaves the name empty when EA gives a blank one', () => {
    const json = { me: { player: { pd: '1', psd: '2', displayName: '  ' } } }

    expect(parseIdentity(json).displayName).toBeNull()
  })

  it('rejects a reply without a player as a parse error', () => {
    expect(thrown(() => parseIdentity({ me: null })).kind).toBe('parse')
  })
})

describe('parseOwned', () => {
  it('lists every owned PC game with a trimmed title and a resized landscape cover', () => {
    const owned = parseOwned(data('owned.json'))

    expect(owned).toHaveLength(15)
    expect(owned[0]).toEqual({
      offerId: 'Origin.OFR.50.0005734',
      slug: 'skate',
      title: 'skate.™',
      coverUrl: expect.stringMatching(/^https:\/\/app-images\.ea\.com\/.+\?w=920$/),
      portraitUrl: expect.stringMatching(/^https:\/\/app-images\.ea\.com\/.+\?w=600$/),
    })
  })

  it('leaves out add-ons, and falls back to the product name and then the offer id', () => {
    const json = {
      me: {
        ownedGameProducts: {
          items: [
            {
              originOfferId: 'dlc',
              product: { name: 'Pack', baseItem: { gameType: 'EXPANSION' } },
            },
            { originOfferId: 'named', product: { name: ' Product name ', baseItem: null } },
            { originOfferId: 'bare', product: null },
          ],
        },
      },
    }

    expect(parseOwned(json).map((game) => [game.offerId, game.title, game.coverUrl])).toEqual([
      ['named', 'Product name', null],
      ['bare', 'bare', null],
    ])
  })

  it('refuses a cover that is not a web address', () => {
    const json = {
      me: {
        ownedGameProducts: {
          items: [
            {
              originOfferId: 'x',
              product: { baseItem: { keyArt: { largestImage: { path: 'file:///C:/art.jpg' } } } },
            },
          ],
        },
      },
    }

    expect(parseOwned(json)[0]?.coverUrl).toBeNull()
  })
})

describe('parseLibrary', () => {
  const owned = parseOwned(data('owned.json'))

  it('keeps one game per achievement set and leaves out games without achievements', () => {
    const games = parseLibrary(owned, data('offers-and-recent.json'), NOW)

    expect(games).toHaveLength(12)
    expect(games.map((game) => game.title)).not.toContain('The Sims™ 4')
    expect(games.filter((game) => game.ref.externalId === JEDI)).toHaveLength(1)
  })

  it('names a game after its first offer and dates it by its latest session', () => {
    const jedi = parseLibrary(owned, data('offers-and-recent.json'), NOW).find(
      (game) => game.ref.externalId === JEDI,
    )

    expect(jedi).toMatchObject({
      title: 'STAR WARS Jedi: Fallen Order™',
      iconUrl: null,
      lastPlayed: new Date('2025-04-22T18:44:17.000Z'),
      recentlyPlayed: false,
      playtimeSeconds: 12600,
    })
    expect(jedi?.coverUrl).toMatch(/SWJFO-game-art-16x9\.jpg\?w=920$/)
  })

  it('reads the 1970 date EA uses for "never recorded" as not played', () => {
    const games = parseLibrary(owned, data('offers-and-recent.json'), NOW)

    expect(games.find((game) => game.title === 'Apex Legends')?.lastPlayed).toBeNull()
  })

  it('marks a game played in the last two weeks as recent', () => {
    const soon = new Date('2025-05-01T00:00:00.000Z')
    const jedi = parseLibrary(owned, data('offers-and-recent.json'), soon).find(
      (game) => game.ref.externalId === JEDI,
    )

    expect(jedi?.recentlyPlayed).toBe(true)
  })

  it('takes the latest session when one set is owned through several offers', () => {
    const offers = {
      legacyOffers: [
        { offerId: 'a', achievementSetOverride: 'set' },
        { offerId: 'b', achievementSetOverride: 'set' },
      ],
      me: {
        recentGames: {
          items: [
            {
              gameSlug: 'old',
              totalPlayTimeSeconds: 5400,
              lastSessionEndDate: '2024-01-01T00:00:00.000Z',
            },
            {
              gameSlug: 'new',
              totalPlayTimeSeconds: 3600,
              lastSessionEndDate: '2026-09-20T00:00:00.000Z',
            },
          ],
        },
      },
    }
    const games = parseLibrary(
      [
        {
          offerId: 'a',
          slug: 'old',
          title: 'First',
          coverUrl: 'https://x/a.jpg',
          portraitUrl: null,
        },
        {
          offerId: 'b',
          slug: 'new',
          title: 'Second',
          coverUrl: 'https://x/b.jpg',
          portraitUrl: 'https://x/b-tall.jpg',
        },
      ],
      offers,
      NOW,
    )

    expect(games).toEqual([
      {
        ref: { externalId: 'set' },
        title: 'First',
        iconUrl: null,
        coverUrl: 'https://x/a.jpg',
        portraitUrl: 'https://x/b-tall.jpg',
        lastPlayed: new Date('2026-09-20T00:00:00.000Z'),
        recentlyPlayed: true,
        playtimeSeconds: 5400,
      },
    ])
  })

  it('reports playtime in seconds, with zero for a game never played', () => {
    const games = parseLibrary(owned, data('offers-and-recent.json'), NOW)

    expect(games.find((game) => game.ref.externalId === JEDI)?.playtimeSeconds).toBe(12600)
    expect(games.find((game) => game.title === 'Apex Legends')?.playtimeSeconds).toBe(0)
  })

  it('reports no playtime for a game EA lists no recent entry for', () => {
    const offers = {
      legacyOffers: [{ offerId: 'a', achievementSetOverride: 'set' }],
      me: { recentGames: { items: [] } },
    }
    const [game] = parseLibrary(
      [{ offerId: 'a', slug: 'x', title: 'X', coverUrl: null, portraitUrl: null }],
      offers,
      NOW,
    )

    expect(game?.playtimeSeconds).toBeNull()
  })

  it('rejects a reply without offers as a parse error', () => {
    expect(thrown(() => parseLibrary(owned, { legacyOffers: null }, NOW)).kind).toBe('parse')
  })
})

describe('parseAchievements', () => {
  it('reads every achievement in a set, in id order, and the unlocked ones with their time', () => {
    const jedi = parseAchievements(fixture('achievements-jedi-fallen-order.json'))

    expect(jedi.achievements).toHaveLength(39)
    expect(jedi.achievements.slice(0, 3).map((a) => a.externalId)).toEqual(['1', '2', '3'])
    expect(jedi.unlocks).toHaveLength(19)
    expect(jedi.achievements.find((a) => a.externalId === '6')).toEqual({
      externalId: '6',
      name: 'Trust Only In The Force',
      description: 'Complete the story',
      iconUrl:
        'https://achievements.gameservices.ea.com/achievements/icons/75158_196485_50844-6-208.png',
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: null,
      globalPercent: null,
    })
    expect(jedi.unlocks.find((u) => u.achievementExternalId === '6')).toEqual({
      achievementExternalId: '6',
      unlockedAt: new Date(1788204808 * 1000),
      progress: null,
    })
  })

  it('keeps hidden achievements hidden', () => {
    const jedi = parseAchievements(fixture('achievements-jedi-fallen-order.json'))

    expect(jedi.achievements.filter((a) => a.hidden).map((a) => a.externalId)).toEqual(['14'])
  })

  it('reads the unlock rarity when EA has it', () => {
    const battlefield = parseAchievements(fixture('achievements-battlefield-4.json'))

    expect(battlefield.achievements.find((a) => a.externalId === '1')).toMatchObject({
      name: 'Storm bringer',
      globalPercent: 31.35,
    })
    expect(battlefield.unlocks).toEqual([])
  })

  it('treats a set where every rarity is 0.00 as having no rarity', () => {
    const apex = parseAchievements(fixture('achievements-apex-legends.json'))

    expect(apex.achievements.every((a) => a.globalPercent === null)).toBe(true)
  })

  it('dates an unlock without a state time by its "u" time, and never dates a locked one', () => {
    const apex = parseAchievements(fixture('achievements-apex-legends.json'))

    expect(apex.unlocks.map((u) => u.achievementExternalId)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '6',
      '7',
      '9',
    ])
    expect(apex.unlocks[0]?.unlockedAt).toEqual(new Date(1553013021 * 1000))
  })

  it('keeps an unlock without any time as undated, and names an unnamed one by its id', () => {
    const game = parseAchievements({ x9: { complete: true, name: ' ', u: 0 } })

    expect(game.achievements[0]?.name).toBe('x9')
    expect(game.unlocks).toEqual([
      { achievementExternalId: 'x9', unlockedAt: null, progress: null },
    ])
  })

  it('rejects a malformed reply as a parse error', () => {
    expect(thrown(() => parseAchievements({ one: { name: 'no state' } })).kind).toBe('parse')
    expect(thrown(() => parseAchievements([1, 2])).kind).toBe('parse')
  })
})
