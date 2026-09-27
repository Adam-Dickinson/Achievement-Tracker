import { describe, expect, it } from 'vitest'
import type { RecentPlatinum, RecentUnlock } from '@shared/library'
import { groupByDay } from './groupByDay'

function unlock(achievementId: number, unlockedAt: Date): RecentUnlock {
  return {
    achievementId,
    gameId: 1,
    platformGameId: 10,
    gameTitle: 'Hades',
    platform: 'steam',
    name: `Achievement ${achievementId}`,
    description: null,
    iconUrl: null,
    globalPercent: null,
    platinum: false,
    kind: 'achievement',
    unlockedAt,
  }
}

describe('groupByDay', () => {
  it('puts unlocks from the same local calendar day together, keeping their order', () => {
    const days = groupByDay([
      unlock(1, new Date(2026, 8, 23, 23, 59)),
      unlock(2, new Date(2026, 8, 23, 0, 1)),
      unlock(3, new Date(2026, 8, 22, 23, 59)),
    ])

    expect(days.map((day) => day.unlocks.map((u) => u.achievementId))).toEqual([[1, 2], [3]])
    expect(days[0]?.date).toEqual(new Date(2026, 8, 23, 23, 59))
  })

  it('gives each day a different key, even across months and years', () => {
    const days = groupByDay([
      unlock(1, new Date(2027, 0, 1, 10, 0)),
      unlock(2, new Date(2026, 11, 31, 10, 0)),
      unlock(3, new Date(2026, 10, 1, 10, 0)),
    ])

    expect(new Set(days.map((day) => day.key)).size).toBe(3)
  })

  it('puts platinums in the same days as unlocks', () => {
    const platinum: RecentPlatinum = {
      kind: 'platinum',
      gameId: 1,
      platformGameId: 10,
      gameTitle: 'Hades',
      platform: 'steam',
      unlockedAt: new Date(2026, 8, 23, 12, 0),
    }

    const days = groupByDay([platinum, unlock(1, new Date(2026, 8, 23, 11, 0))])

    expect(days).toHaveLength(1)
    expect(days[0]?.unlocks.map((item) => item.kind)).toEqual(['platinum', 'achievement'])
  })

  it('gives no days for no unlocks', () => {
    expect(groupByDay([])).toEqual([])
  })
})
