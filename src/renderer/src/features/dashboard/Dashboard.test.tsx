// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardStats } from '@shared/dashboard'
import type { LibraryGame, RecentUnlock } from '@shared/library'
import { fakeApi } from '@/test/fake-api'
import { Dashboard } from './Dashboard'

function game(id: number, title: string, unlocked: number, total: number): LibraryGame {
  return {
    id,
    title,
    platforms: ['steam'],
    coverUrl: null,
    unlocked,
    total,
    lastUnlockAt: null,
  }
}

const UNLOCK: RecentUnlock = {
  achievementId: 11,
  gameId: 3,
  platformGameId: 30,
  gameTitle: 'Elden Ring',
  platform: 'steam',
  name: 'Age of the Stars',
  description: 'Achieve the "Age of the Stars" ending',
  iconUrl: null,
  globalPercent: 1.2,
  unlockedAt: new Date(2026, 2, 9, 12, 0),
}

const STATS: DashboardStats = {
  unlockedAchievements: 3482,
  totalAchievements: 5120,
  gamesTracked: 214,
  completedGames: 27,
  unlockedThisWeek: 41,
  nearlyThere: [game(1, 'Hollow Knight', 61, 63), game(2, 'Celeste', 31, 33)],
  recentUnlocks: [UNLOCK],
}

const getDashboard = vi.fn<() => Promise<DashboardStats>>()
let dataChanged: () => void = () => {}
const onOpenGame = vi.fn()

beforeEach(() => {
  window.api = fakeApi({
    getDashboard,
    onDataChanged: (listener) => {
      dataChanged = listener
      return () => {}
    },
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Dashboard', () => {
  it('shows a loading status before the stats arrive', () => {
    getDashboard.mockReturnValue(new Promise(() => {}))
    render(<Dashboard onOpenGame={onOpenGame} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('shows the totals from the main process, then clears the loading status', async () => {
    getDashboard.mockResolvedValue(STATS)
    render(<Dashboard onOpenGame={onOpenGame} />)

    expect(await screen.findByText('68%')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText((214).toLocaleString())).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
  })

  it('shows the games closest to 100%, and opens one when clicked', async () => {
    getDashboard.mockResolvedValue(STATS)
    render(<Dashboard onOpenGame={onOpenGame} />)

    const section = await screen.findByRole('region', { name: 'Nearly there' })
    expect(
      within(section)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining('Hollow Knight'), expect.stringContaining('Celeste')])

    fireEvent.click(within(section).getByRole('button', { name: /Celeste/ }))
    expect(onOpenGame).toHaveBeenCalledWith(2)
  })

  it('leaves out "Nearly there" when no game is part-way through', async () => {
    getDashboard.mockResolvedValue({ ...STATS, nearlyThere: [] })
    render(<Dashboard onOpenGame={onOpenGame} />)

    await screen.findByText('68%')
    expect(screen.queryByRole('region', { name: 'Nearly there' })).not.toBeInTheDocument()
  })

  it('lists recent unlocks with their game, rarity and percentage, and opens the game', async () => {
    getDashboard.mockResolvedValue(STATS)
    render(<Dashboard onOpenGame={onOpenGame} />)

    const section = await screen.findByRole('region', { name: 'Recent unlocks' })
    const row = within(section).getByRole('button')
    expect(row).toHaveTextContent('Age of the Stars')
    expect(row).toHaveTextContent('Elden Ring · Steam')
    expect(row).toHaveTextContent('Ultra Rare')
    expect(row).toHaveTextContent('1.2%')

    fireEvent.click(row)
    expect(onOpenGame).toHaveBeenCalledWith(3, 30)
  })

  it('says when nothing has been unlocked yet', async () => {
    getDashboard.mockResolvedValue({ ...STATS, recentUnlocks: [] })
    render(<Dashboard onOpenGame={onOpenGame} />)

    expect(await screen.findByText(/Nothing unlocked yet/)).toBeInTheDocument()
  })

  it('reloads when the main process says the data changed', async () => {
    getDashboard
      .mockResolvedValueOnce(STATS)
      .mockResolvedValueOnce({ ...STATS, unlockedThisWeek: 42 })
    render(<Dashboard onOpenGame={onOpenGame} />)
    await screen.findByText('41')

    act(() => dataChanged())

    expect(await screen.findByText('42')).toBeInTheDocument()
  })

  it('still loads under StrictMode, where effects run twice', async () => {
    getDashboard.mockResolvedValue(STATS)
    render(
      <StrictMode>
        <Dashboard onOpenGame={onOpenGame} />
      </StrictMode>,
    )

    expect(await screen.findByText('68%')).toBeInTheDocument()
  })
})
