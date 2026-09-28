// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardStats, DayCount, RarestUnlock } from '@shared/dashboard'
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
  platinum: false,
  kind: 'achievement',
  unlockedAt: new Date(2026, 2, 9, 12, 0),
}

const RAREST: RarestUnlock = {
  achievementId: 21,
  gameId: 4,
  platformGameId: 40,
  gameTitle: 'Call of Duty: Black Ops III',
  platform: 'playstation',
  name: 'Time Travel Will Tell',
  description: 'Complete the Zombies story',
  iconUrl: null,
  globalPercent: 0.1,
  platinum: false,
  unlockedAt: null,
  coverUrl: 'https://cover/4.jpg',
}

const WEEK: DayCount[] = [0, 1, 5, 1, 3, 2, 3].map((count, i) => ({
  date: new Date(2026, 8, 21 + i),
  count,
}))

const STATS: DashboardStats = {
  unlockedAchievements: 3482,
  totalAchievements: 5120,
  gamesTracked: 214,
  completedGames: 27,
  unlockedToday: 3,
  unlockedThisWeek: 15,
  streakDays: 12,
  week: WEEK,
  unlockedByRarity: { ultra_rare: 9, rare: 142, uncommon: 388, common: 745 },
  platinums: 9,
  platforms: [
    { platform: 'steam', games: 120, unlocked: 402, total: 536 },
    { platform: 'playstation', games: 1, unlocked: 0, total: 0 },
  ],
  nearlyThere: [game(1, 'Hollow Knight', 61, 63), game(2, 'Celeste', 31, 33)],
  recentUnlocks: [UNLOCK],
  rarestUnlock: RAREST,
  rarestThisWeek: 1.2,
}

const getDashboard = vi.fn<() => Promise<DashboardStats>>()
let dataChanged: () => void = () => {}
const onOpenGame = vi.fn()
const onNavigate = vi.fn()

function renderDashboard(stats: DashboardStats = STATS) {
  getDashboard.mockResolvedValue(stats)
  return render(<Dashboard onOpenGame={onOpenGame} onNavigate={onNavigate} />)
}

const n = (value: number) => value.toLocaleString().replace(/\s/g, ' ')

const hero = () => screen.findByRole('region', { name: 'Achievements unlocked' })

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
    render(<Dashboard onOpenGame={onOpenGame} onNavigate={onNavigate} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('names the page for screen readers and greets you', async () => {
    renderDashboard()

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(await hero()).toHaveTextContent(/Good (morning|afternoon|evening)/)
  })

  it('leads with the achievements unlocked, the share done and what is left', async () => {
    renderDashboard()

    const section = await hero()
    expect(section).toHaveTextContent(n(3482))
    expect(section).toHaveTextContent(`of ${n(5120)}`)
    expect(section).toHaveTextContent('68.0%')
    expect(section).toHaveTextContent(`${n(1638)} still to go across ${n(214)} games`)
    expect(
      within(section).getByRole('progressbar', { name: 'Achievements unlocked' }),
    ).toHaveAttribute('aria-valuenow', '68')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it("shows today's and this week's unlocks and the streak", async () => {
    renderDashboard()

    const section = await hero()
    expect(section).toHaveTextContent('3 today')
    expect(section).toHaveTextContent('15 this week')
    expect(section).toHaveTextContent('12-day streak')
  })

  it('leaves out the streak when there is none', async () => {
    renderDashboard({ ...STATS, streakDays: 0 })

    expect(await hero()).not.toHaveTextContent('streak')
  })

  it('counts platinums, then the unlocks of each rarity, in words', async () => {
    renderDashboard()

    const rarity = within(await hero()).getByRole('list', { name: 'By rarity' })
    expect(
      within(rarity)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['9Platinum', '9Ultra Rare', '142Rare', '388Uncommon', '745Common'])
  })

  it('separates thousands in the platinum count', async () => {
    renderDashboard({ ...STATS, platinums: 1203 })

    const rarity = within(await hero()).getByRole('list', { name: 'By rarity' })
    expect(within(rarity).getAllByRole('listitem')[0]).toHaveTextContent(`${n(1203)}Platinum`)
  })

  it('fans out the covers of the games closest to 100%, each opening its game', async () => {
    renderDashboard()

    const cover = within(await hero()).getByRole('button', { name: 'Celeste, 93%' })
    fireEvent.click(cover)
    expect(onOpenGame).toHaveBeenCalledWith(2)
  })

  it('features the rarest unlock with its game, rarity and global rate, opening the game', async () => {
    renderDashboard()

    const card = await screen.findByRole('region', { name: 'Rarest unlock' })
    expect(card).toHaveTextContent('Time Travel Will Tell')
    expect(card).toHaveTextContent('Call of Duty: Black Ops III')
    expect(card).toHaveTextContent('Ultra Rare')
    expect(card).toHaveTextContent('Global unlock rate0.1%')
    expect(within(card).getByRole('img', { name: 'PlayStation' })).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: /Time Travel Will Tell/ }))
    expect(onOpenGame).toHaveBeenCalledWith(4, 40)
  })

  it('explains the rarest unlock before any platform reports rarity', async () => {
    renderDashboard({ ...STATS, rarestUnlock: null })

    expect(await screen.findByRole('region', { name: 'Rarest unlock' })).toHaveTextContent(
      /appears here/,
    )
  })

  it('shows the games closest to 100%, opens one, and links to the Library', async () => {
    renderDashboard()

    const section = await screen.findByRole('region', { name: 'Nearly there' })
    const cards = within(section).getAllByRole('button', { name: /achievements/ })
    expect(cards.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Hollow Knight'),
      expect.stringContaining('Celeste'),
    ])

    fireEvent.click(within(section).getByRole('button', { name: /Celeste/ }))
    expect(onOpenGame).toHaveBeenCalledWith(2)

    fireEvent.click(within(section).getByRole('button', { name: 'Library' }))
    expect(onNavigate).toHaveBeenCalledWith('library')
  })

  it('leaves out "Nearly there" when no game is part-way through', async () => {
    renderDashboard({ ...STATS, nearlyThere: [] })

    await hero()
    expect(screen.queryByRole('region', { name: 'Nearly there' })).not.toBeInTheDocument()
  })

  it('lists recent unlocks with their game, platform, rarity and percentage, and opens the game', async () => {
    renderDashboard()

    const section = await screen.findByRole('region', { name: 'Recent unlocks' })
    const row = within(section).getByRole('button', { name: /Age of the Stars/ })
    expect(row).toHaveTextContent('Elden Ring')
    expect(within(row).getByRole('img', { name: 'Steam' })).toBeInTheDocument()
    expect(row).toHaveTextContent('Ultra Rare')
    expect(row).toHaveTextContent('1.2%')

    fireEvent.click(row)
    expect(onOpenGame).toHaveBeenCalledWith(3, 30)

    fireEvent.click(within(section).getByRole('button', { name: 'All activity' }))
    expect(onNavigate).toHaveBeenCalledWith('activity')
  })

  it('says when nothing has been unlocked yet', async () => {
    renderDashboard({ ...STATS, recentUnlocks: [] })

    expect(await screen.findByText(/Nothing unlocked yet/)).toBeInTheDocument()
  })

  it('shows each platform with its completion and achievements, and links to Accounts', async () => {
    renderDashboard()

    const section = await screen.findByRole('region', { name: 'Platforms' })
    const [steam, playstation] = within(section).getAllByRole('listitem')
    expect(steam).toHaveTextContent('Steam')
    expect(steam).toHaveTextContent('402 / 536')
    expect(steam).toHaveTextContent('75.0%')
    expect(within(steam!).getByRole('progressbar', { name: 'Steam completion' })).toHaveAttribute(
      'aria-valuenow',
      '75',
    )
    expect(playstation).toHaveTextContent('0 / 0')
    expect(playstation).toHaveTextContent('0%')

    fireEvent.click(within(section).getByRole('button', { name: 'Accounts' }))
    expect(onNavigate).toHaveBeenCalledWith('accounts')
  })

  it('leaves out "Platforms" before any account has games', async () => {
    renderDashboard({ ...STATS, platforms: [] })

    await hero()
    expect(screen.queryByRole('region', { name: 'Platforms' })).not.toBeInTheDocument()
  })

  it('charts the last seven days, with the best day and the daily average', async () => {
    renderDashboard()

    const section = await screen.findByRole('region', { name: 'This week' })
    const days = within(section).getAllByRole('listitem')
    expect(days).toHaveLength(7)
    const wednesday = new Date(2026, 8, 23).toLocaleDateString(undefined, { weekday: 'long' })
    expect(days[2]).toHaveAccessibleName(`${wednesday}: 5 unlocks`)
    expect(section).toHaveTextContent(`Best day ${wednesday} · 5`)
    expect(section).toHaveTextContent('Daily avg 2.1')
  })

  it('says when nothing was unlocked in the last seven days', async () => {
    renderDashboard({ ...STATS, week: WEEK.map((day) => ({ ...day, count: 0 })) })

    expect(await screen.findByRole('region', { name: 'This week' })).toHaveTextContent(
      'No unlocks in the last 7 days',
    )
  })

  it('reloads when the main process says the data changed', async () => {
    getDashboard.mockResolvedValueOnce(STATS).mockResolvedValueOnce({ ...STATS, unlockedToday: 4 })
    render(<Dashboard onOpenGame={onOpenGame} onNavigate={onNavigate} />)
    expect(await hero()).toHaveTextContent('3 today')

    act(() => dataChanged())

    expect(await screen.findByText('4 today')).toBeInTheDocument()
  })

  it('still loads under StrictMode, where effects run twice', async () => {
    getDashboard.mockResolvedValue(STATS)
    render(
      <StrictMode>
        <Dashboard onOpenGame={onOpenGame} onNavigate={onNavigate} />
      </StrictMode>,
    )

    expect(await hero()).toBeInTheDocument()
  })
})
