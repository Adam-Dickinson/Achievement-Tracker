import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { parseAchievements, parseLibrary } from './parse'

const NOW = new Date('2026-09-25T17:00:00.000Z')
const USER_ID = '00000000-0000-4000-8000-0000000000aa'
const SIEGE = '0d2ae42d-4c27-4cb7-af6c-2099062302bb'
const VALHALLA = 'c4f15d67-1300-4e9e-bbe3-12e11a148e81'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve('tests/fixtures/ubisoft', name), 'utf8')).data
}

interface GameNode {
  spaceId: string
  name?: string | null
  avatarUrl?: string | null
  backgroundUrl?: string | null
  viewer?: unknown
}

function library(nodes: readonly GameNode[]): unknown {
  return { viewer: { id: USER_ID, name: 'TestPlayer', games: { nodes } } }
}

function node(spaceId: string, overrides: Partial<GameNode> = {}): GameNode {
  return {
    spaceId,
    name: 'A Game',
    avatarUrl: null,
    backgroundUrl: null,
    viewer: {
      meta: {
        lastPlayedDate: '2026-01-01T00:00:00Z',
        achievements: { totalCount: 10, completedCount: 1 },
      },
    },
    ...overrides,
  }
}

function achievements(nodes: readonly unknown[]): unknown {
  return {
    game: { id: VALHALLA, viewer: { meta: { achievements: { totalCount: nodes.length, nodes } } } },
  }
}

function achievement(completionDate: string | null, isCompleted = true): unknown {
  return {
    id: '7013-1',
    title: 'The Saga Begins',
    description: 'Complete the Prologue',
    icon: 'https://ubiservices.cdn.ubi.com/x/achievement/1.png',
    viewer: { meta: { isCompleted, completionDate } },
  }
}

describe('parseLibrary', () => {
  it('reads the viewer and lists only the games that have Ubisoft achievements', () => {
    const { viewer, games } = parseLibrary(fixture('games.json'), NOW)

    expect(viewer).toEqual({ id: USER_ID, name: 'TestPlayer' })
    expect(games.map((game) => game.title)).toEqual([
      "Tom Clancy's Rainbow Six® Siege",
      "Assassin's Creed Black Flag Resynced",
      "Assassin's Creed Shadows",
      'Assassin’s Creed® III Remastered',
      "Assassin's Creed® Odyssey",
      "Assassin's Creed® Valhalla",
      "Assassin's Creed® IV Black Flag",
      'Far Cry® 5',
      'Rainbow Six® Extraction',
      "Tom Clancy's The Division 2",
    ])
  })

  it('keys each game by its space ID, with the icon and a resized background as the cover', () => {
    const [siege] = parseLibrary(fixture('games.json'), NOW).games

    expect(siege).toEqual({
      ref: { externalId: SIEGE },
      title: "Tom Clancy's Rainbow Six® Siege",
      iconUrl: `https://ubiservices.cdn.ubi.com/${SIEGE}/spaceCardAsset/gameIconAssetId.png`,
      coverUrl: `https://ubiservices.cdn.ubi.com/${SIEGE}/applicationCardAsset/RSIX70c0f.jpg?imwidth=920`,
      lastPlayed: new Date('2026-09-23T18:09:47Z'),
      recentlyPlayed: true,
    })
  })

  it('counts a game as recently played only if it was played in the last 14 days', () => {
    const { games } = parseLibrary(fixture('games.json'), NOW)

    expect(games.filter((game) => game.recentlyPlayed).map((game) => game.ref.externalId)).toEqual([
      SIEGE,
    ])
    expect(
      parseLibrary(
        library([
          node(SIEGE, { viewer: { meta: { achievements: { totalCount: 1, completedCount: 0 } } } }),
        ]),
        NOW,
      ).games[0],
    ).toMatchObject({ lastPlayed: null, recentlyPlayed: false })
  })

  it('lists a game once even if Ubisoft returns it twice', () => {
    const { games } = parseLibrary(library([node(SIEGE), node(SIEGE.toUpperCase())]), NOW)

    expect(games).toHaveLength(1)
  })

  it('falls back to the space ID for a game without a name, and drops images that are not web links', () => {
    const [game] = parseLibrary(
      library([
        node(SIEGE, { name: '  ', avatarUrl: 'file:///C:/icon.png', backgroundUrl: 'nope' }),
      ]),
      NOW,
    ).games

    expect(game).toMatchObject({ title: SIEGE, iconUrl: null, coverUrl: null })
  })

  it('upgrades http images to https, and only resizes images on the Ubisoft CDN', () => {
    const [game] = parseLibrary(
      library([
        node(SIEGE, {
          avatarUrl: 'http://ubiservices.cdn.ubi.com/a/icon.png',
          backgroundUrl: 'https://static-live.ubisoft.com/live/prod/SWO/Background.jpg',
        }),
      ]),
      NOW,
    ).games

    expect(game).toMatchObject({
      iconUrl: 'https://ubiservices.cdn.ubi.com/a/icon.png',
      coverUrl: 'https://static-live.ubisoft.com/live/prod/SWO/Background.jpg',
    })
  })

  it('names the viewer null when Ubisoft gives no name', () => {
    const json = { viewer: { id: USER_ID, name: null, games: { nodes: [] } } }

    expect(parseLibrary(json, NOW).viewer.name).toBeNull()
  })

  it('throws a parse error for a reply in the wrong shape', () => {
    expect(() => parseLibrary({ viewer: { id: 'not-a-uuid', games: { nodes: [] } } }, NOW)).toThrow(
      ProviderError,
    )
    expect(() => parseLibrary(library([node('not-a-space-id')]), NOW)).toThrow(/games response/)
  })
})

describe('parseAchievements', () => {
  it('reads every achievement and the ones you have unlocked, with their dates', () => {
    const game = parseAchievements(fixture('achievements-valhalla.json'))

    expect(game.achievements).toHaveLength(92)
    expect(game.achievements[0]).toEqual({
      externalId: '7013-1',
      name: 'The Saga Begins',
      description: 'Complete the Prologue',
      iconUrl:
        'https://ubiservices.cdn.ubi.com/10322023-976e-49e7-8e02-df5325c868bf/achievement/94874ec998162160471a29558d8b53a1_1.png',
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: null,
      globalPercent: null,
    })
    expect(game.unlocks.map((u) => [u.achievementExternalId, u.unlockedAt?.toISOString()])).toEqual(
      [
        ['7013-1', '2022-12-13T13:08:21.000Z'],
        ['7013-2', '2022-12-15T19:38:01.000Z'],
        ['7013-13', '2022-12-15T21:47:43.000Z'],
        ['7013-35', '2023-01-01T18:17:22.000Z'],
      ],
    )
  })

  it('reads a date that already has a time zone as it is', () => {
    const game = parseAchievements(achievements([achievement('2026-09-25T18:00:00+02:00')]))

    expect(game.unlocks[0]?.unlockedAt).toEqual(new Date('2026-09-25T16:00:00Z'))
  })

  it('keeps an unlock that has no date, and ignores a date on a locked achievement', () => {
    expect(parseAchievements(achievements([achievement(null)])).unlocks).toEqual([
      { achievementExternalId: '7013-1', unlockedAt: null, progress: null },
    ])
    expect(
      parseAchievements(achievements([achievement('2026-01-01T00:00:00', false)])).unlocks,
    ).toEqual([])
  })

  it('falls back to the ID for an achievement without a title', () => {
    const untitled = { ...(achievement(null) as object), title: '', description: '  ' }

    expect(parseAchievements(achievements([untitled])).achievements[0]).toMatchObject({
      name: '7013-1',
      description: null,
    })
  })

  it('returns nothing for a game Ubisoft does not know', () => {
    expect(parseAchievements({ game: null })).toEqual({ achievements: [], unlocks: [] })
  })

  it('throws a parse error for a date that is not a date', () => {
    expect(() => parseAchievements(achievements([achievement('yesterday')]))).toThrow(
      /achievements response/,
    )
  })
})
