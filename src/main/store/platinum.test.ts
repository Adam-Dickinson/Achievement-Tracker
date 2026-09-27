import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RemoteAchievement } from '@shared/models'
import { applyMigrations } from './migrate'
import {
  APP_PLATINUM_ID,
  appPlatinumAchievement,
  awardPlatinum,
  awardPlatinums,
  isPlatinumAchievement,
} from './platinum'
import {
  addPlatformGames,
  getPlatformGameByExternalId,
  insertNewUnlocks,
  upsertAccount,
  upsertAchievements,
} from './sync-store'

const own = (description: string | null, tier: string | null = null) => ({ tier, description })

describe('isPlatinumAchievement', () => {
  it.each([
    ['ELDEN RING', 'Obtained all achievements'],
    ['DARK SOULS™ II: Scholar of the First Sin', 'Earn all achievements'],
    ['Far Cry Primal', 'Obtain all the Achievements.'],
    ['DARK SOULS™: REMASTERED', 'All achievements completed. Congratulations!'],
    ['Sekiro™: Shadows Die Twice', 'All achievements have been unlocked.'],
    ['Viking Brothers 3', 'For earning every achievement.'],
    ['Valheim', 'Collect all trophies.'],
    ['Hades II', 'Earn all other Achievements'],
    ['God of War', 'Obtain all other achievements'],
    ['The Last of Us™ Part I', 'Collect all the achievements'],
    ['The Last of Us™ Part II Remastered', 'Collect all the regular story achievements'],
    ['Mortal Shell II', 'Unlock All Achievements for Mortal Shell II '],
    ['Stellar Blade™', 'You have unlocked all achievements in the main game.'],
    ['Days Gone', 'Go above and BEYOND, unlocking every trophy in Days Gone'],
    ['Baby Steps', 'Collect all Achievements in Baby Steps'],
    ["DEATH STRANDING DIRECTOR'S CUT", 'Obtained all Death Stranding achievements.'],
    ['Horizon Zero Dawn™ Complete Edition', 'Obtained all Horizon Zero Dawn achievements.'],
    [
      'Horizon Forbidden West™ Complete Edition',
      'Obtained all Horizon Forbidden West Achievements.',
    ],
    ["Ghost of Tsushima DIRECTOR'S CUT", 'Obtain all base game achievements.'],
    ['Ghostrunner 2', 'All achievements obtained'],
    ['Dispatch', 'Collected All Achievements'],
  ])('accepts the "unlock everything" achievement of %s', (title, description) => {
    expect(isPlatinumAchievement(own(description), title)).toBe(true)
  })

  it.each([
    [
      'theHunter: Call of the Wild™',
      'Photograph every trophy animal species in Medved-Taiga National Park',
    ],
    ['LEGO® Batman™: Legacy of the Dark Knight', 'Collect all Batcave Trophies'],
    ['Stranded Deep', 'Collect all sea monster trophies.'],
    ['Green Hell', 'Complete all Spirits of Amazonia achievements'],
    ['Counter-Strike: Source', 'Unlock all 6 Pistol kill achievements'],
    ['Counter-Strike: Source', 'Unlock every weapon kill achievement'],
    [
      'Skillshot City',
      "Knife 2 enemies in a row while falling from the sky in a normal BR match. Like all achievements this can't be completed in the warmup round.",
    ],
    ['Portal', 'Beat the game'],
  ])('leaves out %s: "%s"', (title, description) => {
    expect(isPlatinumAchievement(own(description), title)).toBe(false)
  })

  it("accepts a platform's platinum tier whatever its description says", () => {
    expect(isPlatinumAchievement(own('Earn every trophy', 'platinum'), 'Any')).toBe(true)
    expect(isPlatinumAchievement(own(null, 'platinum'), 'Any')).toBe(true)
  })

  it('ignores the description of an achievement with another tier', () => {
    expect(isPlatinumAchievement(own('Earn all trophies', 'gold'), 'Any')).toBe(false)
  })

  it('needs a description without a tier', () => {
    expect(isPlatinumAchievement(own(null), 'Any')).toBe(false)
  })

  it('folds accents in the description and the title', () => {
    expect(isPlatinumAchievement(own('Obtenez tous les succès'), 'Café')).toBe(false)
    expect(isPlatinumAchievement(own('Earn all Pokémon achievements'), 'Pokemon Quest')).toBe(true)
  })

  it('leaves out descriptions longer than 90 characters', () => {
    const long = `Earn all achievements ${'and then some more words '.repeat(3)}`
    expect(long.length).toBeGreaterThan(90)
    expect(isPlatinumAchievement(own(long), 'Any')).toBe(false)
  })
})

describe('appPlatinumAchievement', () => {
  it("is a platinum stand-in for the game's app-awarded Platinum", () => {
    expect(appPlatinumAchievement('Portal')).toEqual({
      externalId: APP_PLATINUM_ID,
      name: 'Platinum',
      description: 'Every achievement in Portal',
      iconUrl: null,
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: 'platinum',
      globalPercent: null,
    })
  })
})

describe('awarding', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    applyMigrations(db)
  })

  function achievement(externalId: string, description = `Do ${externalId}`): RemoteAchievement {
    return {
      externalId,
      name: externalId,
      description,
      iconUrl: null,
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: null,
      globalPercent: 20,
    }
  }

  function seed(
    externalId: string,
    achievements: readonly RemoteAchievement[],
    unlocked: readonly (readonly [string, Date | null])[],
  ): number {
    const account = upsertAccount(db, { platform: 'steam', externalId: 'acc', displayName: 'P' })
    addPlatformGames(db, account, [
      {
        ref: { externalId },
        title: `Game ${externalId}`,
        iconUrl: null,
        coverUrl: null,
        lastPlayed: null,
        recentlyPlayed: false,
      },
    ])
    const { id } = getPlatformGameByExternalId(db, account.id, externalId)
    upsertAchievements(db, id, achievements)
    insertNewUnlocks(
      db,
      id,
      unlocked.map(([achievementExternalId, unlockedAt]) => ({
        achievementExternalId,
        unlockedAt,
        progress: null,
      })),
    )
    return id
  }

  const rows = () => db.prepare('SELECT * FROM platinum ORDER BY platform_game_id').all()
  const DETECTED = new Date('2026-09-27T12:00:00Z')
  const EARLY = new Date('2026-09-20T10:00:00Z')
  const LATE = new Date('2026-09-26T10:28:09Z')

  it('awards a complete game once, dated at its latest unlock', () => {
    const id = seed(
      '1',
      [achievement('a'), achievement('b')],
      [
        ['a', EARLY],
        ['b', LATE],
      ],
    )

    expect(awardPlatinum(db, id, DETECTED)).toEqual({ earnedAt: LATE })
    expect(awardPlatinum(db, id, DETECTED)).toBeNull()
    expect(rows()).toEqual([
      {
        platform_game_id: id,
        earned_at: LATE.toISOString(),
        detected_at: DETECTED.toISOString(),
      },
    ])
  })

  it('gives no date when none of the unlocks is dated', () => {
    const id = seed('1', [achievement('a')], [['a', null]])

    expect(awardPlatinum(db, id, DETECTED)).toEqual({ earnedAt: null })
  })

  it('awards nothing to a game that is not complete', () => {
    const id = seed('1', [achievement('a'), achievement('b')], [['a', EARLY]])

    expect(awardPlatinum(db, id, DETECTED)).toBeNull()
    expect(rows()).toEqual([])
  })

  it('awards nothing to a game without achievements', () => {
    const id = seed('1', [], [])

    expect(awardPlatinum(db, id, DETECTED)).toBeNull()
  })

  it('awards nothing to a game that has its own platinum', () => {
    const id = seed(
      '1',
      [achievement('a'), achievement('p', 'Unlock all achievements')],
      [
        ['a', EARLY],
        ['p', LATE],
      ],
    )

    expect(awardPlatinum(db, id, DETECTED)).toBeNull()
    expect(rows()).toEqual([])
  })

  it('keeps the Platinum when the game later gains achievements', () => {
    const id = seed('1', [achievement('a')], [['a', EARLY]])
    awardPlatinum(db, id, DETECTED)

    upsertAchievements(db, id, [achievement('a'), achievement('dlc')])

    expect(rows()).toHaveLength(1)
  })

  it('awards every complete game at startup, once', () => {
    const complete = seed('1', [achievement('a')], [['a', EARLY]])
    seed('2', [achievement('a'), achievement('b')], [['a', EARLY]])

    expect(awardPlatinums(db)).toBe(1)
    expect(awardPlatinums(db)).toBe(0)
    expect(rows()).toEqual([expect.objectContaining({ platform_game_id: complete })])
  })
})
