import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import {
  parseAchievementCount,
  parseAchievements,
  parseCatalog,
  parseLibraryPage,
  parsePlayerUnlocks,
  parsePlaytime,
  toGameAchievements,
} from './parse'

const ROCKET_LEAGUE = '9773aa1aa54f4f7b80e44bef04986cea'
const RHYTHM_CASTLE = '048550a9623d4824894430a2c2823e02'
const JEDI = 'e509c16d53714b13ba8e393966507255'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve('tests/fixtures/epic', name), 'utf8'))
}

function data(name: string): unknown {
  return (fixture(name) as { data: unknown }).data
}

function parseError(run: () => unknown): ProviderError {
  try {
    run()
  } catch (error) {
    if (error instanceof ProviderError) return error
    throw error
  }
  throw new Error('expected a ProviderError')
}

describe('parseLibraryPage', () => {
  it('reads each record and the cursor for the next page', () => {
    const page = parseLibraryPage(fixture('library-page1.json'))

    expect(page.nextCursor).toBe('fake-cursor-2')
    expect(page.records.map((r) => [r.namespace, r.appName, r.sandboxName])).toEqual([
      [ROCKET_LEAGUE, 'Sugar', 'Rocket League®'],
      [RHYTHM_CASTLE, '8c5172fc5e454598aab78a4a19791638', 'Live'],
      ['ue', 'UE_4.27Chaos', 'UE Marketplace'],
    ])
  })

  it('gives no cursor on the last page', () => {
    expect(parseLibraryPage(fixture('library-page2.json')).nextCursor).toBeNull()
  })

  it('throws a parse error for a reply without records', () => {
    const error = parseError(() => parseLibraryPage({ responseMetadata: {} }))

    expect(error.kind).toBe('parse')
    expect(error.message).toMatch(/^Epic: unexpected library response/)
  })
})

describe('parsePlaytime', () => {
  it('maps each app name to its seconds played', () => {
    const playtime = parsePlaytime(fixture('playtime.json'))

    expect(playtime.get('Sugar')).toBe(166388)
    expect(playtime.get('shoebill')).toBe(59650)
    expect(playtime.get('Kinglet')).toBeUndefined()
  })
})

describe('parseAchievementCount', () => {
  it("reads the game's total, even when the list is trimmed", () => {
    expect(parseAchievementCount(data(`schema-${ROCKET_LEAGUE}.json`))).toBe(88)
  })

  it('counts 0 for a game without Epic achievements, whose fields are all null', () => {
    expect(parseAchievementCount(data('schema-none.json'))).toBe(0)
  })
})

describe('parseAchievements and toGameAchievements', () => {
  it('maps each achievement with its name, text, icons, XP, tier and rarity', () => {
    const game = toGameAchievements(parseAchievements(data(`schema-${ROCKET_LEAGUE}.json`)), [])

    expect(game.achievements).toHaveLength(5)
    expect(game.achievements[0]).toEqual({
      externalId: '0',
      name: 'Virtuoso',
      description: 'Unlock All Original Achievements',
      iconUrl: expect.stringMatching(/^https:\/\/shared-static-prod\.epicgames\.com\//),
      iconLockedUrl: expect.stringMatching(/^https:\/\/shared-static-prod\.epicgames\.com\//),
      hidden: false,
      points: 100,
      tier: 'gold',
      globalPercent: 0.1,
    })
  })

  it('keeps the real name and text of a hidden achievement, whose locked text is empty', () => {
    const achievements = parseAchievements(data(`schema-${RHYTHM_CASTLE}.json`))
    const hidden = toGameAchievements(achievements, []).achievements.find((a) => a.hidden)

    expect(hidden).toMatchObject({
      externalId: 'ACH_03_DefeatEggplant',
      name: 'The Vegetable',
      description: 'Defeat DJ Eggplant',
    })
  })

  it('gives no achievements for a game without any', () => {
    expect(parseAchievements(data('schema-none.json'))).toEqual([])
  })

  it('falls back to the locked text, then the ID, and upgrades http icons to https', () => {
    const [achievement] = toGameAchievements(
      [
        {
          name: 'ACH_X',
          hidden: false,
          unlockedDisplayName: '',
          lockedDisplayName: null,
          unlockedDescription: null,
          lockedDescription: 'Locked text',
          unlockedIconLink: 'http://shared-static-prod.epicgames.com/icon',
          lockedIconLink: 'not a url',
          XP: null,
          tier: null,
          rarity: null,
        },
      ],
      [],
    ).achievements

    expect(achievement).toMatchObject({
      name: 'ACH_X',
      description: 'Locked text',
      iconUrl: 'https://shared-static-prod.epicgames.com/icon',
      iconLockedUrl: null,
      points: null,
      tier: null,
      globalPercent: null,
    })
  })

  it('drops an unlock whose achievement is not in the list', () => {
    const achievements = parseAchievements(data(`schema-${ROCKET_LEAGUE}.json`))
    const game = toGameAchievements(achievements, [
      { achievementExternalId: '1', unlockedAt: null, progress: null },
      { achievementExternalId: 'gone', unlockedAt: null, progress: null },
    ])

    expect(game.unlocks.map((u) => u.achievementExternalId)).toEqual(['1'])
  })
})

describe('parsePlayerUnlocks', () => {
  it('reads each unlocked achievement with its date', () => {
    expect(parsePlayerUnlocks(data(`player-${ROCKET_LEAGUE}.json`))).toEqual([
      {
        achievementExternalId: '1',
        unlockedAt: new Date('2025-05-02T18:03:41.722Z'),
        progress: null,
      },
      {
        achievementExternalId: '10',
        unlockedAt: new Date('2023-07-05T21:05:39.306Z'),
        progress: null,
      },
      {
        achievementExternalId: '11',
        unlockedAt: new Date('2025-02-25T21:25:48.359Z'),
        progress: null,
      },
    ])
  })

  it('gives no unlocks for a game never played, whose records are null', () => {
    expect(parsePlayerUnlocks(data('player-none.json'))).toEqual([])
  })

  it('leaves out an entry that is not unlocked, and keeps one without a date', () => {
    const reply = {
      PlayerAchievement: {
        playerAchievementGameRecordsBySandbox: {
          records: [
            {
              playerAchievements: [
                { playerAchievement: { achievementName: 'a', unlocked: false, unlockDate: null } },
                { playerAchievement: { achievementName: 'b', unlocked: true, unlockDate: null } },
              ],
            },
          ],
        },
      },
    }

    expect(parsePlayerUnlocks(reply)).toEqual([
      { achievementExternalId: 'b', unlockedAt: null, progress: null },
    ])
  })

  it('throws a parse error for an unlock date that is not a date', () => {
    const reply = {
      PlayerAchievement: {
        playerAchievementGameRecordsBySandbox: {
          records: [
            {
              playerAchievements: [
                { playerAchievement: { achievementName: 'a', unlocked: true, unlockDate: 'soon' } },
              ],
            },
          ],
        },
      },
    }

    expect(parseError(() => parsePlayerUnlocks(reply)).kind).toBe('parse')
  })
})

describe('parseCatalog', () => {
  it('takes the title and the wide cover, resized, from the catalog', () => {
    const details = parseCatalog(fixture(`catalog-${RHYTHM_CASTLE}.json`))

    expect(details.title).toBe('SUPER CRAZY RHYTHM CASTLE')
    expect(details.coverUrl).toBe(
      'https://cdn1.epicgames.com/spt-assets/3e4cea34f89d440d97cf22ddf6c122f2/super-crazy-rhythm-castle-sub3n.jpg?resize=1&w=920',
    )
  })

  it('uses the first wide cover when a game lists several images', () => {
    expect(parseCatalog(fixture(`catalog-${JEDI}.json`)).coverUrl).toMatch(
      /\/SWJFO-510x680-04ec2ab0afa8b571f51c34577bf1ec09\.jpg\?resize=1&w=920$/,
    )
  })

  it('gives no title or cover for an empty catalog reply', () => {
    expect(parseCatalog(fixture('catalog-empty.json'))).toEqual({
      title: null,
      coverUrl: null,
      portraitUrl: null,
      heroUrl: null,
    })
  })

  it('prefers the item that is a game, and falls back to the wide then the tall image', () => {
    const details = parseCatalog({
      dlc: { title: 'Soundtrack', categories: [{ path: 'addons' }], keyImages: [] },
      game: {
        title: ' The Game ',
        categories: [{ path: 'games' }],
        keyImages: [
          { type: 'DieselGameBoxTall', url: 'https://cdn1.epicgames.com/tall.jpg' },
          { type: 'DieselGameBoxWide', url: 'https://example.com/wide.jpg' },
        ],
      },
    })

    expect(details).toEqual({
      title: 'The Game',
      coverUrl: 'https://example.com/wide.jpg',
      portraitUrl: 'https://cdn1.epicgames.com/tall.jpg?resize=1&w=600',
      heroUrl: null,
    })
  })

  it('takes the tall box art for the portrait and the wide box art for the hero', () => {
    const details = parseCatalog(fixture('catalog-048550a9623d4824894430a2c2823e02.json'))

    expect(details.portraitUrl).toMatch(/^https:\/\/cdn1\.epicgames\.com\/.+\?resize=1&w=600$/)
    expect(details.heroUrl).toMatch(/^https:\/\/cdn1\.epicgames\.com\/.+\?resize=1&w=1920$/)
  })
})
