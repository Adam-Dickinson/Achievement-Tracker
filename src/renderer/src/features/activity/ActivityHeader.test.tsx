// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DashboardStats } from '@shared/dashboard'
import { ActivityHeader } from './ActivityHeader'

afterEach(cleanup)

const STATS: DashboardStats = {
  unlockedAchievements: 10,
  totalAchievements: 20,
  gamesTracked: 2,
  completedGames: 0,
  unlockedToday: 3,
  unlockedThisWeek: 23,
  streakDays: 6,
  week: [],
  unlockedByRarity: { ultra_rare: 1, rare: 2, uncommon: 3, common: 4 },
  platinums: 0,
  platforms: [],
  nearlyThere: [],
  recentUnlocks: [],
  rarestUnlock: null,
  rarestThisWeek: 1.2,
}

describe('ActivityHeader', () => {
  it("titles the page and sums up the week: unlocks, streak and the week's rarest", () => {
    render(<ActivityHeader stats={STATS} />)

    const header = screen.getByRole('region', { name: 'Activity' })
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent('Activity')
    expect(header).toHaveTextContent('Every platform, newest first')
    expect(screen.getByText('23 this week')).toBeInTheDocument()
    expect(screen.getByText('6-day streak')).toBeInTheDocument()
    expect(screen.getByText('Rarest this week: 1.2%')).toBeInTheDocument()
  })

  it('leaves out the streak and the rarest when there are none', () => {
    render(<ActivityHeader stats={{ ...STATS, streakDays: 0, rarestThisWeek: null }} />)

    expect(screen.getByText('23 this week')).toBeInTheDocument()
    expect(screen.queryByText(/streak/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Rarest this week/)).not.toBeInTheDocument()
  })

  it('shows the title and legend but no figures until the stats arrive', () => {
    render(<ActivityHeader stats={null} />)

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument()
    expect(screen.queryByText(/this week/)).not.toBeInTheDocument()
  })

  it('explains the rarity colours, rarest first', () => {
    render(<ActivityHeader stats={STATS} />)

    expect(
      within(screen.getByRole('list', { name: 'Rarity' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Ultra Rare', 'Rare', 'Uncommon', 'Common'])
  })
})
