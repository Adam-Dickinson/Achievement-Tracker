import { describe, expect, it } from 'vitest'
import type { UnlockEvent } from '@shared/models'
import { describeUnlockTiming } from './unlock-timing'

function event(unlockedAt: Date | null): UnlockEvent {
  return {
    platform: 'steam',
    gameTitle: 'Hades',
    achievement: {
      externalId: 'a1',
      name: 'Escaped',
      description: null,
      iconUrl: null,
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: null,
      globalPercent: 12,
    },
    unlockedAt,
    detectedAt: new Date('2026-09-25T14:00:07.400Z'),
  }
}

describe('describeUnlockTiming', () => {
  it('gives the unlock time, the time it was found and the seconds between them', () => {
    expect(describeUnlockTiming(event(new Date('2026-09-25T14:00:00.000Z')))).toBe(
      'Steam unlock found at 2026-09-25T14:00:07.400Z: Hades, "Escaped", unlocked at 2026-09-25T14:00:00.000Z (7 s earlier)',
    )
  })

  it('says so when the platform gave no unlock time', () => {
    expect(describeUnlockTiming(event(null))).toBe(
      'Steam unlock found at 2026-09-25T14:00:07.400Z: Hades, "Escaped" (no unlock time from the platform)',
    )
  })
})
