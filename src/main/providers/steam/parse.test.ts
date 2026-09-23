import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import {
  parseGameSchema,
  parseGlobalPercentages,
  parseLibrary,
  parsePlayerAchievements,
  parsePlayerSummary,
  type SteamPlayerAchievement,
  type SteamSchemaAchievement,
  toGameAchievements,
} from './parse'

// Sanitized real responses; see docs/PROVIDERS.md (Steam) for how they were captured.
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve('tests/fixtures/steam', name), 'utf8'))
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

function rarity(achievements: unknown): unknown {
  return { achievementpercentages: { achievements } }
}

describe('parseGlobalPercentages', () => {
  it('maps each achievement id to its percent, converting Steam’s strings to numbers', () => {
    const percents = parseGlobalPercentages(fixture('global-pct-883710.json'))

    expect(percents).toEqual(
      new Map([
        ['NEW_ACHIEVEMENT_1_1', 94.9],
        ['NEW_ACHIEVEMENT_1_7', 52],
        ['NEW_ACHIEVEMENT_1_9', 28.3],
        ['NEW_ACHIEVEMENT_1_31', 6],
      ]),
    )
  })

  it('returns an empty map for an app Steam has no rarity for (the `{}` body)', () => {
    expect(parseGlobalPercentages(fixture('global-pct-unknown-app.json'))).toEqual(new Map())
  })

  it('also accepts percents sent as numbers', () => {
    expect(parseGlobalPercentages(rarity([{ name: 'A', percent: 12.5 }]))).toEqual(
      new Map([['A', 12.5]]),
    )
  })

  it('accepts the 0 and 100 boundaries', () => {
    const percents = parseGlobalPercentages(
      rarity([
        { name: 'NONE', percent: '0' },
        { name: 'ALL', percent: 100 },
      ]),
    )

    expect(percents.get('NONE')).toBe(0)
    expect(percents.get('ALL')).toBe(100)
  })

  it.each([
    ['null', null],
    ['a string', 'oops'],
    ['an array', []],
    ['achievementpercentages that is not an object', { achievementpercentages: 'x' }],
    ['achievements that is not an array', { achievementpercentages: { achievements: {} } }],
    ['an entry that is not an object', rarity(['x'])],
    ['an entry without a name', rarity([{ percent: '1.0' }])],
    ['a name that is not a string', rarity([{ name: 7, percent: '1.0' }])],
    ['an empty name', rarity([{ name: '', percent: '1.0' }])],
    ['a missing percent', rarity([{ name: 'A' }])],
    ['an empty percent string', rarity([{ name: 'A', percent: '' }])],
    ['a whitespace percent string', rarity([{ name: 'A', percent: '  ' }])],
    ['a non-numeric percent string', rarity([{ name: 'A', percent: 'abc' }])],
    ['a negative percent', rarity([{ name: 'A', percent: '-0.1' }])],
    ['a percent over 100', rarity([{ name: 'A', percent: 100.1 }])],
    ['a percent of another type', rarity([{ name: 'A', percent: true }])],
  ])('throws a parse error for %s', (_label, json) => {
    expect(parseErrorFrom(() => parseGlobalPercentages(json)).kind).toBe('parse')
  })
})

const ICONS = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/883710'
const LEON = "Complete Leon's story."

function schemaEntry(overrides: Partial<SteamSchemaAchievement> = {}): SteamSchemaAchievement {
  return {
    name: 'ACH',
    displayName: 'An achievement',
    hidden: 0,
    icon: 'i.jpg',
    icongray: 'g.jpg',
    ...overrides,
  }
}

function playerRow(overrides: Partial<SteamPlayerAchievement> = {}): SteamPlayerAchievement {
  return { apiname: 'ACH', achieved: 1, unlocktime: 1_700_000_000, ...overrides }
}

function gameSchema(achievements: unknown): unknown {
  return { game: { availableGameStats: { achievements } } }
}

function playerStats(achievements: unknown): unknown {
  return { playerstats: { success: true, achievements } }
}

describe('parseGameSchema', () => {
  it('reads each achievement’s id, name, description, hidden flag and icons', () => {
    const schema = parseGameSchema(fixture('schema-883710.json'))

    expect(schema.map((achievement) => achievement.name)).toEqual([
      'NEW_ACHIEVEMENT_1_1',
      'NEW_ACHIEVEMENT_1_7',
      'NEW_ACHIEVEMENT_1_9',
      'NEW_ACHIEVEMENT_1_31',
    ])
    expect(schema[1]).toEqual({
      name: 'NEW_ACHIEVEMENT_1_7',
      displayName: 'A Hero Emerges',
      description: LEON,
      hidden: 0,
      icon: `${ICONS}/6fd6449a3aa8909f9760cd5899e78b00846357c3.jpg`,
      icongray: `${ICONS}/aec9f3abc08a82e4c9fef76857cc4c24a2816bf8.jpg`,
    })
  })

  it('accepts hidden achievements, which have no description key', () => {
    const hidden = parseGameSchema(fixture('schema-883710.json'))[0]

    expect(hidden?.hidden).toBe(1)
    expect(hidden?.description).toBeUndefined()
  })

  it('returns no achievements for a game without stats (`{"game":{}}`)', () => {
    expect(parseGameSchema(fixture('schema-no-stats.json'))).toEqual([])
  })

  it('returns no achievements for a game with stats but no achievements', () => {
    expect(parseGameSchema({ game: { availableGameStats: {} } })).toEqual([])
  })

  it.each([
    ['null', null],
    ['a body without `game`', {}],
    ['achievements that is not an array', gameSchema({})],
    ['an empty id', gameSchema([{ ...schemaEntry(), name: '' }])],
    ['a missing display name', gameSchema([{ ...schemaEntry(), displayName: undefined }])],
    ['a hidden flag other than 0 or 1', gameSchema([{ ...schemaEntry(), hidden: 2 }])],
    ['a missing icon', gameSchema([{ ...schemaEntry(), icon: undefined }])],
  ])('throws a parse error for %s', (_label, json) => {
    expect(parseErrorFrom(() => parseGameSchema(json)).kind).toBe('parse')
  })
})

describe('parsePlayerAchievements', () => {
  it('reads each achievement’s id, achieved flag and unlock time', () => {
    expect(parsePlayerAchievements(fixture('player-achievements-883710.json'))).toEqual([
      { apiname: 'NEW_ACHIEVEMENT_1_1', achieved: 1, unlocktime: 1772049064 },
      { apiname: 'NEW_ACHIEVEMENT_1_7', achieved: 1, unlocktime: 1773077038 },
      { apiname: 'NEW_ACHIEVEMENT_1_9', achieved: 0, unlocktime: 0 },
      { apiname: 'NEW_ACHIEVEMENT_1_31', achieved: 0, unlocktime: 0 },
    ])
  })

  it('returns nothing for a game without stats (Steam’s "Requested app has no stats" error)', () => {
    expect(parsePlayerAchievements(fixture('player-achievements-no-stats.json'))).toEqual([])
  })

  it('returns nothing when a successful reply has no achievements list', () => {
    expect(parsePlayerAchievements({ playerstats: { success: true } })).toEqual([])
  })

  it('passes any other Steam error on as an `other` error with Steam’s text', () => {
    const error = parseErrorFrom(() =>
      parsePlayerAchievements({ playerstats: { success: false, error: 'Profile is not public' } }),
    )

    expect(error.kind).toBe('other')
    expect(error.message).toContain('Profile is not public')
  })

  it.each([
    ['null', null],
    ['a body without `playerstats`', {}],
    ['a missing success flag', { playerstats: { achievements: [] } }],
    ['a failure without error text', { playerstats: { success: false } }],
    ['an achieved flag other than 0 or 1', playerStats([{ ...playerRow(), achieved: 2 }])],
    ['a negative unlock time', playerStats([{ ...playerRow(), unlocktime: -1 }])],
    ['a fractional unlock time', playerStats([{ ...playerRow(), unlocktime: 1.5 }])],
    ['a missing unlock time', playerStats([{ ...playerRow(), unlocktime: undefined }])],
    ['an empty id', playerStats([{ ...playerRow(), apiname: '' }])],
  ])('throws a parse error for %s', (_label, json) => {
    expect(parseErrorFrom(() => parsePlayerAchievements(json)).kind).toBe('parse')
  })
})

describe('toGameAchievements', () => {
  function fromFixtures() {
    return toGameAchievements(
      parseGameSchema(fixture('schema-883710.json')),
      parsePlayerAchievements(fixture('player-achievements-883710.json')),
      parseGlobalPercentages(fixture('global-pct-883710.json')),
    )
  }

  function achievementFromFixtures(externalId: string) {
    return fromFixtures().achievements.find((achievement) => achievement.externalId === externalId)
  }

  it('maps a visible achievement with its description, icons and rarity', () => {
    expect(achievementFromFixtures('NEW_ACHIEVEMENT_1_7')).toEqual({
      externalId: 'NEW_ACHIEVEMENT_1_7',
      name: 'A Hero Emerges',
      description: LEON,
      iconUrl: `${ICONS}/6fd6449a3aa8909f9760cd5899e78b00846357c3.jpg`,
      iconLockedUrl: `${ICONS}/aec9f3abc08a82e4c9fef76857cc4c24a2816bf8.jpg`,
      hidden: false,
      points: null,
      tier: null,
      globalPercent: 52,
    })
  })

  it('maps a hidden achievement with no description', () => {
    const achievement = achievementFromFixtures('NEW_ACHIEVEMENT_1_1')

    expect(achievement?.hidden).toBe(true)
    expect(achievement?.description).toBeNull()
  })

  it('keeps every achievement, locked or not, in schema order', () => {
    expect(fromFixtures().achievements.map((achievement) => achievement.externalId)).toEqual([
      'NEW_ACHIEVEMENT_1_1',
      'NEW_ACHIEVEMENT_1_7',
      'NEW_ACHIEVEMENT_1_9',
      'NEW_ACHIEVEMENT_1_31',
    ])
  })

  it('turns only the achieved rows into unlocks, with Unix seconds as a Date', () => {
    expect(fromFixtures().unlocks).toEqual([
      {
        achievementExternalId: 'NEW_ACHIEVEMENT_1_1',
        unlockedAt: new Date(1772049064 * 1000),
        progress: null,
      },
      {
        achievementExternalId: 'NEW_ACHIEVEMENT_1_7',
        unlockedAt: new Date(1773077038 * 1000),
        progress: null,
      },
    ])
  })

  it('gives an unlock with an unlock time of 0 no date', () => {
    const { unlocks } = toGameAchievements(
      [schemaEntry()],
      [playerRow({ unlocktime: 0 })],
      new Map(),
    )

    expect(unlocks).toEqual([{ achievementExternalId: 'ACH', unlockedAt: null, progress: null }])
  })

  it('skips an unlock for an achievement the schema doesn’t list', () => {
    const { unlocks } = toGameAchievements(
      [schemaEntry()],
      [playerRow(), playerRow({ apiname: 'NOT_IN_SCHEMA' })],
      new Map(),
    )

    expect(unlocks.map((unlock) => unlock.achievementExternalId)).toEqual(['ACH'])
  })

  it('leaves rarity empty when Steam has none for an achievement', () => {
    const { achievements } = toGameAchievements([schemaEntry()], [], new Map([['OTHER', 10]]))

    expect(achievements[0]?.globalPercent).toBeNull()
  })

  it('turns empty text into null', () => {
    const { achievements } = toGameAchievements(
      [schemaEntry({ description: '  ', icon: '', icongray: '' })],
      [],
      new Map(),
    )

    expect(achievements[0]).toMatchObject({
      description: null,
      iconUrl: null,
      iconLockedUrl: null,
    })
  })
})

const APP_IMAGES = 'https://media.steampowered.com/steamcommunity/public/images/apps'

function ownedGame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    appid: 10,
    name: 'A game',
    img_icon_url: 'abc',
    has_community_visible_stats: true,
    rtime_last_played: 1_700_000_000,
    ...overrides,
  }
}

function ownedGames(games: unknown): unknown {
  return { response: { game_count: 1, games } }
}

function recentGames(games: unknown): unknown {
  return { response: { total_count: 1, games } }
}

const NO_RECENT = { response: { total_count: 0 } }

const PORTAL = {
  ref: { externalId: '400' },
  title: 'Portal',
  iconUrl: `${APP_IMAGES}/400/cfa928ab4119dd137e50d728e8fe703e4e970aff.jpg`,
  lastPlayed: new Date(1621685363 * 1000),
  recentlyPlayed: false,
}

const RESIDENT_EVIL_2 = {
  ref: { externalId: '883710' },
  title: 'Resident Evil 2',
  iconUrl: `${APP_IMAGES}/883710/86ef2fdebeced746313994ccf2d7afb1f2887bf0.jpg`,
  lastPlayed: new Date(1790160642 * 1000),
  recentlyPlayed: false,
}

const SPIDER_MAN = {
  ref: { externalId: '1817070' },
  title: 'Marvel’s Spider-Man Remastered',
  iconUrl: `${APP_IMAGES}/1817070/346333cb340139ad8b697005e5c79a3162c387b0.jpg`,
  lastPlayed: null,
  recentlyPlayed: true,
}

describe('parseLibrary', () => {
  it('keeps only the owned games Steam flags as having stats, mapped to RemoteGame', () => {
    expect(parseLibrary(fixture('owned-games.json'), NO_RECENT)).toEqual([PORTAL, RESIDENT_EVIL_2])
  })

  it('adds recently played games the account doesn’t own (Steam Families), once each', () => {
    expect(parseLibrary(fixture('owned-games.json'), fixture('recently-played.json'))).toEqual([
      PORTAL,
      { ...RESIDENT_EVIL_2, recentlyPlayed: true },
      SPIDER_MAN,
    ])
  })

  it('doesn’t bring back an owned game without stats because it was played recently', () => {
    const library = parseLibrary(
      ownedGames([ownedGame({ appid: 6060, has_community_visible_stats: undefined })]),
      recentGames([{ appid: 6060, name: 'No achievements', img_icon_url: 'abc' }]),
    )

    expect(library).toEqual([])
  })

  it('accepts a recently played game without an icon', () => {
    const [game] = parseLibrary(ownedGames([]), recentGames([{ appid: 20, name: 'Borrowed' }]))

    expect(game).toEqual({
      ref: { externalId: '20' },
      title: 'Borrowed',
      iconUrl: null,
      lastPlayed: null,
      recentlyPlayed: true,
    })
  })

  it('marks exactly the games in the recently played list as recently played', () => {
    const library = parseLibrary(fixture('owned-games.json'), fixture('recently-played.json'))

    expect(library.filter((game) => game.recentlyPlayed).map((game) => game.title)).toEqual([
      'Resident Evil 2',
      'Marvel’s Spider-Man Remastered',
    ])
  })

  it('gives a never-played game (last played 0) no date', () => {
    const [game] = parseLibrary(ownedGames([ownedGame({ rtime_last_played: 0 })]), NO_RECENT)

    expect(game?.lastPlayed).toBeNull()
  })

  it('gives a game without an icon hash no icon', () => {
    const [game] = parseLibrary(ownedGames([ownedGame({ img_icon_url: '' })]), NO_RECENT)

    expect(game?.iconUrl).toBeNull()
  })

  it('returns no games when neither reply has a games list', () => {
    expect(parseLibrary({ response: {} }, { response: {} })).toEqual([])
  })

  it.each([
    ['null', null],
    ['a body without `response`', {}],
    ['games that is not an array', recentGames({})],
    ['a missing appid', recentGames([{ name: 'A' }])],
    ['a missing name', recentGames([{ appid: 20 }])],
    ['an icon hash that is not text', recentGames([{ appid: 20, name: 'A', img_icon_url: 5 }])],
  ])('throws a parse error for a recently played reply with %s', (_label, json) => {
    expect(parseErrorFrom(() => parseLibrary(ownedGames([]), json)).kind).toBe('parse')
  })

  it.each([
    ['null', null],
    ['a body without `response`', {}],
    ['games that is not an array', ownedGames({})],
    ['a missing appid', ownedGames([ownedGame({ appid: undefined })])],
    ['an appid of 0', ownedGames([ownedGame({ appid: 0 })])],
    ['an appid as text', ownedGames([ownedGame({ appid: '400' })])],
    ['a missing name', ownedGames([ownedGame({ name: undefined })])],
    [
      'a stats flag that is not a boolean',
      ownedGames([ownedGame({ has_community_visible_stats: 1 })]),
    ],
    ['a missing last-played time', ownedGames([ownedGame({ rtime_last_played: undefined })])],
  ])('throws a parse error for %s', (_label, json) => {
    expect(parseErrorFrom(() => parseLibrary(json, NO_RECENT)).kind).toBe('parse')
  })
})

describe('parsePlayerSummary', () => {
  it('returns the SteamID and display name', () => {
    expect(parsePlayerSummary(fixture('player-summaries.json'))).toEqual({
      externalId: '76561190000000001',
      displayName: 'Test Player',
    })
  })

  it('throws an `other` error when no profile matches the SteamID', () => {
    const error = parseErrorFrom(() => parsePlayerSummary({ response: { players: [] } }))

    expect(error.kind).toBe('other')
  })

  it.each([
    ['null', null],
    ['a body without `response`', {}],
    ['players that is not an array', { response: { players: {} } }],
    ['a player without a SteamID', { response: { players: [{ personaname: 'A' }] } }],
    ['an empty display name', { response: { players: [{ steamid: '1', personaname: '' }] } }],
  ])('throws a parse error for %s', (_label, json) => {
    expect(parseErrorFrom(() => parsePlayerSummary(json)).kind).toBe('parse')
  })
})
