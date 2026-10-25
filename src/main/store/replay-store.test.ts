import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteAchievement } from '@shared/models'
import { applyMigrations } from './migrate'
import { APP_PLATINUM_ID, awardPlatinums } from './platinum'
import { findReplayEvent } from './replay-store'
import {
  addPlatformGames,
  getPlatformGameByExternalId,
  insertNewUnlocks,
  upsertAccount,
  upsertAchievements,
} from './sync-store'

const DETECTED = new Date('2026-10-20T18:00:00.000Z')
const UNLOCKED = new Date('2026-10-19T21:30:00.000Z')

let db: DatabaseSync

function achievement(externalId: string, overrides: Partial<RemoteAchievement> = {}) {
  return {
    externalId,
    name: `Achievement ${externalId}`,
    description: `Do ${externalId}`,
    iconUrl: `https://icon/${externalId}.jpg`,
    iconLockedUrl: `https://icon/${externalId}-locked.jpg`,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: 12.5,
    ...overrides,
  }
}

function seedGame(achievements: readonly RemoteAchievement[], unlocked: readonly (Date | null)[]) {
  const account = upsertAccount(db, { platform: 'xbox', externalId: 'acc', displayName: 'Player' })
  addPlatformGames(db, account, [
    {
      ref: { externalId: 'g1' },
      title: 'Halo Infinite',
      iconUrl: null,
      coverUrl: null,
      lastPlayed: null,
      recentlyPlayed: false,
    },
  ])
  const { id } = getPlatformGameByExternalId(db, account.id, 'g1')
  upsertAchievements(db, id, achievements)
  insertNewUnlocks(
    db,
    id,
    unlocked.map((unlockedAt, i) => ({
      achievementExternalId: achievements[i]?.externalId ?? '',
      unlockedAt,
      progress: null,
    })),
  )
  return id
}

function achievementId(externalId: string): number {
  const row = db.prepare('SELECT id FROM achievement WHERE external_id = ?').get(externalId) as {
    id: number
  }
  return row.id
}

beforeEach(() => {
  vi.useFakeTimers({ now: DETECTED, toFake: ['Date'] })
  db = new DatabaseSync(':memory:')
  applyMigrations(db)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('findReplayEvent for an achievement', () => {
  it('rebuilds the unlock of an earned achievement from what is stored', () => {
    seedGame(
      [achievement('a', { hidden: true, points: 50, tier: 'gold' }), achievement('b')],
      [UNLOCKED],
    )

    expect(findReplayEvent(db, { kind: 'achievement', achievementId: achievementId('a') })).toEqual(
      {
        platform: 'xbox',
        gameTitle: 'Halo Infinite',
        achievement: achievement('a', { hidden: true, points: 50, tier: 'gold' }),
        unlockedAt: UNLOCKED,
        detectedAt: DETECTED,
      },
    )
  })

  it('replays an unlock the platform did not date', () => {
    seedGame([achievement('a')], [null])

    const event = findReplayEvent(db, { kind: 'achievement', achievementId: achievementId('a') })

    expect(event?.unlockedAt).toBeNull()
    expect(event?.detectedAt).toEqual(DETECTED)
  })

  it('finds nothing for a locked achievement', () => {
    seedGame([achievement('a'), achievement('b')], [UNLOCKED])

    expect(
      findReplayEvent(db, { kind: 'achievement', achievementId: achievementId('b') }),
    ).toBeNull()
  })

  it('finds nothing for an achievement that does not exist', () => {
    expect(findReplayEvent(db, { kind: 'achievement', achievementId: 999 })).toBeNull()
  })
})

describe('findReplayEvent for a Platinum', () => {
  it('rebuilds the app-awarded Platinum of a finished game, dated when it was earned', () => {
    const platformGameId = seedGame([achievement('a'), achievement('b')], [UNLOCKED, null])
    awardPlatinums(db, DETECTED)

    const event = findReplayEvent(db, { kind: 'platinum', platformGameId })

    expect(event).toMatchObject({
      platform: 'xbox',
      gameTitle: 'Halo Infinite',
      detectedAt: DETECTED,
    })
    expect(event?.achievement.externalId).toBe(APP_PLATINUM_ID)
    expect(event?.achievement.tier).toBe('platinum')
  })

  it('finds nothing for a game without a Platinum', () => {
    const platformGameId = seedGame([achievement('a'), achievement('b')], [UNLOCKED])
    awardPlatinums(db, DETECTED)

    expect(findReplayEvent(db, { kind: 'platinum', platformGameId })).toBeNull()
  })
})
