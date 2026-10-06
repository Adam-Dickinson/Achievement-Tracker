// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardStats } from '@shared/dashboard'
import type { LibraryGame } from '@shared/library'
import type { Platform } from '@shared/platform'
import { fakeApi } from '@/test/fake-api'
import { fakeLayout, renderScrolled } from '@/test/layout'
import { Library } from './Library'
import { DEFAULT_VIEW, type LibraryView } from './library-view'

function game(
  id: number,
  title: string,
  unlocked: number,
  total: number,
  platforms: Platform[] = ['steam'],
): LibraryGame {
  return {
    id,
    title,
    platforms,
    coverUrl: `https://cover/${id}.jpg`,
    unlocked,
    total,
    lastUnlockAt: null,
  }
}

const GAMES = [
  game(1, 'Portal', 5, 10),
  game(2, 'Celeste', 10, 10, ['steam', 'playstation']),
  game(3, 'Hades', 0, 0, ['xbox']),
  game(4, 'Ōkami HD', 0, 20),
]

const STATS: DashboardStats = {
  unlockedAchievements: 15,
  totalAchievements: 40,
  gamesTracked: 4,
  completedGames: 1,
  unlockedToday: 0,
  unlockedThisWeek: 0,
  streakDays: 0,
  week: [],
  unlockedByRarity: { ultra_rare: 1, rare: 2, uncommon: 4, common: 8 },
  platinums: 0,
  platforms: [],
  nearlyThere: [],
  recentUnlocks: [],
  rarestUnlock: null,
  rarestThisWeek: null,
}

const listLibrary = vi.fn<() => Promise<LibraryGame[]>>()
let listeners: (() => void)[] = []
const dataChanged = () => listeners.forEach((listener) => listener())
const onOpenGame = vi.fn()
const onOpenAccounts = vi.fn()
const onViewChange = vi.fn<(view: LibraryView) => void>()
let restoreLayout: () => void

beforeEach(() => {
  restoreLayout = fakeLayout()
  listeners = []
  window.api = fakeApi({
    listLibrary,
    onDataChanged: (listener) => {
      listeners.push(listener)
      return () => {}
    },
  })
})

afterEach(() => {
  cleanup()
  restoreLayout()
  vi.resetAllMocks()
})

interface HarnessProps {
  initial?: Partial<LibraryView>
  restoreScrollTop?: number
}

function Harness({ initial = {}, restoreScrollTop }: HarnessProps) {
  const [view, setView] = useState({ ...DEFAULT_VIEW, ...initial })
  return (
    <Library
      name="Adam"
      view={view}
      onViewChange={(next) => {
        onViewChange(next)
        setView(next)
      }}
      restoreScrollTop={restoreScrollTop}
      onOpenGame={onOpenGame}
      onOpenAccounts={onOpenAccounts}
    />
  )
}

async function renderLibrary(games: LibraryGame[] = GAMES, initial: Partial<LibraryView> = {}) {
  listLibrary.mockResolvedValue(games)
  const result = renderScrolled(<Harness initial={initial} />)
  await screen.findByRole('list', { name: 'Games' })
  return result
}

const cards = () => within(screen.getByRole('list', { name: 'Games' })).getAllByRole('button')

const titles = () => cards().map((card) => card.querySelector('span.truncate')?.textContent)

const group = (name: string) => screen.getByRole('group', { name })
const option = (groupName: string, name: string | RegExp) =>
  within(group(groupName)).getByRole('button', { name })
const optionNames = (groupName: string) =>
  within(group(groupName))
    .getAllByRole('button')
    .map((button) => button.textContent)
const select = (name: string) => screen.getByRole('combobox', { name })
const choose = (name: string, value: string) =>
  fireEvent.change(select(name), { target: { value } })
const selectOptions = (name: string) =>
  within(select(name))
    .getAllByRole('option')
    .map((element) => element.textContent)

describe('Library', () => {
  it('shows a loading status until the main process replies', () => {
    listLibrary.mockReturnValue(new Promise(() => {}))
    renderScrolled(<Harness />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument()
  })

  it('points to the Accounts screen when there are no games', async () => {
    listLibrary.mockResolvedValue([])
    renderScrolled(<Harness />)

    await screen.findByRole('heading', { name: 'No games yet' })
    expect(
      screen.getByText('Connect an account on the Accounts screen and its games appear here.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Accounts' }))
    expect(onOpenAccounts).toHaveBeenCalledOnce()
  })

  it('shows every game in the order it arrives, with the count', async () => {
    await renderLibrary()

    expect(screen.getByText('Showing all 4 games')).toBeInTheDocument()
    expect(titles()).toEqual(['Portal', 'Celeste', 'Hades', 'Ōkami HD'])
  })

  it('sorts by completion, name or platform when asked', async () => {
    await renderLibrary()
    expect(selectOptions('Sort by')).toEqual([
      'Last unlock',
      'Completion',
      'Playtime',
      'Name',
      'Platform',
    ])

    choose('Sort by', 'completion')
    expect(titles()).toEqual(['Celeste', 'Portal', 'Ōkami HD', 'Hades'])
    expect(select('Sort by')).toHaveValue('completion')

    choose('Sort by', 'title')
    expect(titles()).toEqual(['Celeste', 'Hades', 'Ōkami HD', 'Portal'])

    choose('Sort by', 'platform')
    expect(titles()).toEqual(['Celeste', 'Ōkami HD', 'Portal', 'Hades'])
  })

  it('sorts by playtime, most played first, and shows each game’s hours', async () => {
    await renderLibrary([
      { ...GAMES[0]!, playtimeSeconds: 3 * 3600 },
      { ...GAMES[1]!, playtimeSeconds: 40 * 3600, playtimePartial: true },
      GAMES[2]!,
      { ...GAMES[3]!, playtimeSeconds: 0 },
    ])

    choose('Sort by', 'playtime')

    expect(titles()).toEqual(['Celeste', 'Portal', 'Ōkami HD', 'Hades'])
    expect(screen.getByText('40 hours played, may be incomplete')).toBeInTheDocument()
    expect(screen.getByText('3 hours played')).toBeInTheDocument()
  })

  it('finds games by any words of their title, ignoring case and accents', async () => {
    await renderLibrary(GAMES, { query: 'hd OKAMI' })

    expect(titles()).toEqual(['Ōkami HD'])
    expect(screen.getByText('Showing 1 of 4 games')).toBeInTheDocument()
  })

  it('offers only the platforms in the library, each with its number of games', async () => {
    await renderLibrary()

    expect(optionNames('Platform')).toEqual(['All 4', 'Steam 3', 'Xbox 1', 'PlayStation 1'])
    expect(option('Platform', /^All/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the games on one platform, counting linked games on each of theirs', async () => {
    await renderLibrary()

    fireEvent.click(option('Platform', /^PlayStation/))

    expect(titles()).toEqual(['Celeste'])
    expect(screen.getByText('Showing 1 of 4 games')).toBeInTheDocument()
  })

  it('filters by progress, counting what each choice would show', async () => {
    await renderLibrary()

    expect(selectOptions('Progress')).toEqual([
      'All progress (4)',
      'In progress (1)',
      'Not started (2)',
      'Completed (1)',
    ])

    choose('Progress', 'in_progress')
    expect(titles()).toEqual(['Portal'])

    choose('Progress', 'not_started')
    expect(titles()).toEqual(['Hades', 'Ōkami HD'])

    choose('Progress', 'completed')
    expect(titles()).toEqual(['Celeste'])
  })

  it('updates the counts on the other filters as the search narrows the games', async () => {
    await renderLibrary(GAMES, { query: 'celeste' })

    expect(optionNames('Platform')).toEqual(['All 1', 'Steam 1', 'Xbox 0', 'PlayStation 1'])
    expect(selectOptions('Progress')).toEqual([
      'All progress (1)',
      'In progress (0)',
      'Not started (0)',
      'Completed (1)',
    ])
  })

  it('says when nothing matches, and clears the filters but keeps the sort and view', async () => {
    await renderLibrary()
    choose('Sort by', 'title')
    fireEvent.click(option('View', 'List'))
    fireEvent.click(option('Platform', /^Xbox/))
    choose('Progress', 'completed')

    expect(screen.getByText('No games match these filters.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Games' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(onViewChange).toHaveBeenLastCalledWith({
      ...DEFAULT_VIEW,
      sort: 'title',
      layout: 'list',
    })
    expect(titles()).toEqual(['Celeste', 'Hades', 'Ōkami HD', 'Portal'])
    expect(screen.getByText('Showing all 4 games')).toBeInTheDocument()
  })

  it('hands every change of the view to its parent, so it survives opening a game', async () => {
    await renderLibrary()

    fireEvent.click(option('Platform', /^Steam/))
    expect(onViewChange).toHaveBeenLastCalledWith({ ...DEFAULT_VIEW, platform: 'steam' })

    fireEvent.click(option('View', 'Portrait'))
    expect(onViewChange).toHaveBeenLastCalledWith({
      ...DEFAULT_VIEW,
      platform: 'steam',
      layout: 'portrait',
    })
  })

  it('shows only installed games when the Installed option is chosen', async () => {
    vi.mocked(window.api.getInstalled).mockResolvedValue([
      { gameId: 2, platformGameId: 1, platform: 'steam' },
    ])
    await renderLibrary()

    await waitFor(() => expect(option('Installed', 'Installed')).toBeEnabled())
    fireEvent.click(option('Installed', 'Installed'))

    expect(titles()).toEqual(['Celeste'])
    expect(onViewChange).toHaveBeenLastCalledWith({ ...DEFAULT_VIEW, installed: true })
  })

  it('disables the Installed option when nothing is installed', async () => {
    await renderLibrary()

    expect(option('Installed', 'Installed')).toBeDisabled()
  })

  it('opens a game when its card is clicked', async () => {
    await renderLibrary()

    fireEvent.click(screen.getByRole('button', { name: /Celeste/ }))

    expect(onOpenGame).toHaveBeenCalledWith(2)
  })

  it('scrolls back to where it was once the games have loaded', async () => {
    listLibrary.mockResolvedValue(GAMES)
    const { scrollParent } = renderScrolled(<Harness restoreScrollTop={640} />)
    expect(scrollParent.scrollTop).toBe(0)

    await screen.findByRole('list', { name: 'Games' })

    expect(scrollParent.scrollTop).toBe(640)
  })

  it('reloads when the main process says the data changed', async () => {
    listLibrary
      .mockResolvedValueOnce([game(1, 'Portal', 0, 0)])
      .mockResolvedValueOnce([game(1, 'Portal', 3, 10)])
    renderScrolled(<Harness />)
    expect(await screen.findByText('Syncing…')).toBeInTheDocument()

    act(() => dataChanged())

    expect(await screen.findByText('30%')).toBeInTheDocument()
  })
})

describe('Library views', () => {
  it('starts on Landscape and offers Portrait and List', async () => {
    await renderLibrary()

    expect(optionNames('View')).toEqual(['Landscape', 'Portrait', 'List'])
    expect(option('View', 'Landscape')).toHaveAttribute('aria-pressed', 'true')
  })

  it('staggers every other column of cards, as designed', async () => {
    await renderLibrary()

    const offsets = cards().map((card) => card.parentElement?.classList.contains('mt-6.5'))
    expect(offsets).toEqual([false, true, false, true])
  })

  it('shows tall posters in Portrait, keeping the order and the stagger', async () => {
    await renderLibrary()

    fireEvent.click(option('View', 'Portrait'))

    expect(titles()).toEqual(['Portal', 'Celeste', 'Hades', 'Ōkami HD'])
    expect(cards()[0]?.querySelector('.aspect-2\\/3')).not.toBeNull()
    expect(cards()[1]?.parentElement).toHaveClass('mt-6.5')
  })

  it('shows one row per game in List, without the stagger', async () => {
    await renderLibrary()

    fireEvent.click(option('View', 'List'))

    expect(titles()).toEqual(['Portal', 'Celeste', 'Hades', 'Ōkami HD'])
    expect(cards().some((card) => card.parentElement?.classList.contains('mt-6.5'))).toBe(false)
    expect(within(cards()[0]!).getByText('50%')).toBeInTheDocument()
  })
})

describe('Library profile', () => {
  it('names the library after the user, with totals counted from the games', async () => {
    window.api = fakeApi({ listLibrary, getDashboard: vi.fn().mockResolvedValue(STATS) })
    await renderLibrary()

    const profile = screen.getByRole('region', { name: 'Your library' })
    expect(within(profile).getByText('Adam')).toBeInTheDocument()
    expect(within(profile).getByRole('img', { name: 'Adam' })).toHaveTextContent('A')
    expect(within(profile).getByText('15 achievements')).toBeInTheDocument()
    expect(within(profile).getByText('4 games')).toBeInTheDocument()
    expect(within(profile).getByText('50% avg. completion')).toBeInTheDocument()
    expect(within(profile).getByText('37.5%')).toBeInTheDocument()
    expect(within(profile).getByText(/of 40/)).toBeInTheDocument()
    expect(within(profile).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37')
  })

  it('counts unlocks per rarity once the stats arrive', async () => {
    window.api = fakeApi({ listLibrary, getDashboard: vi.fn().mockResolvedValue(STATS) })
    await renderLibrary()

    const rarities = screen.getByRole('list', { name: 'Unlocked by rarity' })
    expect(
      await within(rarities)
        .findAllByRole('listitem')
        .then((items) => items.map((item) => item.textContent)),
    ).toEqual(['Ultra Rare1', 'Rare2', 'Uncommon4', 'Common8'])
  })

  it('shows dashes per rarity until the stats arrive', async () => {
    await renderLibrary()

    const rarities = within(screen.getByRole('list', { name: 'Unlocked by rarity' }))
    expect(rarities.getAllByText('–')).toHaveLength(4)
  })
})
