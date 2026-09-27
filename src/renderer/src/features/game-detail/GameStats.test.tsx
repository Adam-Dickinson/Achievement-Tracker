// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameAchievement, GameEntry } from '@shared/library'
import { formatTime } from '@/lib/format'
import { GameStats, latestUnlock } from './GameStats'

afterEach(cleanup)

function achievement(id: number, overrides: Partial<GameAchievement> = {}): GameAchievement {
  return {
    id,
    name: `Achievement ${id}`,
    description: null,
    hidden: false,
    iconUrl: null,
    iconLockedUrl: null,
    globalPercent: 20,
    platinum: false,
    unlocked: false,
    unlockedAt: null,
    ...overrides,
  }
}

function entry(achievements: GameAchievement[]): GameEntry {
  return {
    platformGameId: 1,
    platform: 'steam',
    tag: null,
    title: 'Portal',
    unlocked: achievements.filter((a) => a.unlocked).length,
    total: achievements.length,
    achievements,
    appPlatinum: null,
    hasStorePage: false,
  }
}

const tile = (label: string) => screen.getByText(label, { selector: 'span' }).parentElement

describe('GameStats', () => {
  it('shows the counts, completion, rarest held and the last unlock with its time and platform', () => {
    const today = new Date()
    today.setHours(13, 42, 0, 0)
    render(
      <GameStats
        entry={entry([
          achievement(1, { unlocked: true, globalPercent: 40, unlockedAt: new Date(2026, 0, 2) }),
          achievement(2, { unlocked: true, globalPercent: 3, name: 'Rare one', unlockedAt: today }),
          achievement(3, { globalPercent: 1 }),
          achievement(4),
        ])}
      />,
    )

    expect(tile('Unlocked')).toHaveTextContent('2 / 4')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(tile('Completion')).toHaveTextContent('50%2 achievements left')
    expect(tile('Rarest held')).toHaveTextContent('Rare one')
    expect(tile('Last unlock')?.textContent).toBe(`Last unlockToday${formatTime(today)} · Steam`)
  })

  it('says None yet before anything is unlocked', () => {
    render(<GameStats entry={entry([achievement(1)])} />)

    expect(tile('Rarest held')).toHaveTextContent('None yet')
    expect(tile('Last unlock')).toHaveTextContent('None yet')
  })

  it('says All done at 100%', () => {
    render(<GameStats entry={entry([achievement(1, { unlocked: true })])} />)

    expect(tile('Completion')).toHaveTextContent('100%All done')
  })

  it('shows an older last unlock as its date', () => {
    const older = new Date(2019, 9, 11, 9, 5)
    render(<GameStats entry={entry([achievement(1, { unlocked: true, unlockedAt: older })])} />)

    const date = older.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    expect(tile('Last unlock')?.textContent).toBe(`Last unlock${date}${formatTime(older)} · Steam`)
  })
})

describe('latestUnlock', () => {
  it('finds the newest dated unlock, ignoring undated ones', () => {
    const newest = new Date(2026, 5, 1)
    expect(
      latestUnlock([
        achievement(1, { unlocked: true, unlockedAt: new Date(2026, 0, 1) }),
        achievement(2, { unlocked: true, unlockedAt: newest }),
        achievement(3, { unlocked: true, unlockedAt: null }),
      ]),
    ).toBe(newest)
    expect(latestUnlock([])).toBeNull()
  })
})
