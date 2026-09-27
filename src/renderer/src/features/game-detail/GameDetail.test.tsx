// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MergeGamesInput, UnlinkGameInput } from '@shared/ipc'
import type { GameAchievement, GameDetail as GameDetailData, GameEntry } from '@shared/library'
import { fakeApi } from '@/test/fake-api'
import { fakeLayout, renderScrolled } from '@/test/layout'
import { GameDetail } from './GameDetail'

function achievement(id: number, overrides: Partial<GameAchievement> = {}): GameAchievement {
  return {
    id,
    name: `Achievement ${id}`,
    description: `Do thing ${id}`,
    hidden: false,
    iconUrl: `https://icon/${id}.jpg`,
    iconLockedUrl: `https://icon/${id}-grey.jpg`,
    globalPercent: 50,
    unlocked: false,
    unlockedAt: null,
    ...overrides,
  }
}

function entry(overrides: Partial<GameEntry> = {}): GameEntry {
  const achievements = overrides.achievements ?? [
    achievement(1, { globalPercent: 40, unlocked: true, unlockedAt: new Date(2026, 2, 9, 12, 0) }),
    achievement(2, { globalPercent: 1.2, unlocked: true, unlockedAt: null }),
    achievement(3, { globalPercent: 0.5 }),
    achievement(4, { hidden: true, description: null, globalPercent: 8 }),
  ]
  return {
    platformGameId: 70,
    platform: 'steam',
    tag: null,
    title: 'Elden Ring',
    unlocked: achievements.filter((a) => a.unlocked).length,
    total: achievements.length,
    achievements,
    ...overrides,
  }
}

const DETAIL: GameDetailData = {
  game: {
    id: 7,
    title: 'Elden Ring',
    platforms: ['steam'],
    coverUrl: 'https://cover/7.jpg',
    unlocked: 2,
    total: 4,
    lastUnlockAt: new Date(2026, 2, 9, 12, 0),
  },
  entries: [entry()],
}

const PS5 = entry({
  platformGameId: 71,
  platform: 'playstation',
  tag: 'PS5',
  title: 'Elden Ring (PS5)',
  achievements: [
    achievement(11, { name: 'Elden Lord', unlocked: true, unlockedAt: new Date(2026, 3, 1) }),
  ],
})
const PS4 = entry({
  platformGameId: 72,
  platform: 'playstation',
  tag: 'PS4',
  title: 'Elden Ring (PS4)',
  achievements: [achievement(21, { name: 'Roundtable Hold' }), achievement(22)],
})

const LINKED: GameDetailData = {
  game: { ...DETAIL.game, platforms: ['playstation', 'steam'], unlocked: 1, total: 1 },
  entries: [PS5, entry(), PS4],
}

const getGame = vi.fn<(id: number) => Promise<GameDetailData | null>>()
const listLibrary = vi.fn()
const mergeGames = vi.fn<(input: MergeGamesInput) => Promise<void>>()
const unlinkGame = vi.fn<(input: UnlinkGameInput) => Promise<void>>()
let dataChanged: () => void = () => {}
const onBack = vi.fn()
let restoreLayout: () => void

beforeEach(() => {
  restoreLayout = fakeLayout()
  mergeGames.mockResolvedValue(undefined)
  unlinkGame.mockResolvedValue(undefined)
  listLibrary.mockResolvedValue([
    { ...DETAIL.game },
    { ...DETAIL.game, id: 8, title: 'Elden Ring Nightreign', platforms: ['xbox'] },
    { ...DETAIL.game, id: 9, title: 'Ragnarök Tales', platforms: ['epic'] },
  ])
  window.api = fakeApi({
    getGame,
    listLibrary,
    mergeGames,
    unlinkGame,
    onDataChanged: (listener) => {
      dataChanged = listener
      return () => {}
    },
  })
})

afterEach(() => {
  cleanup()
  restoreLayout()
  vi.resetAllMocks()
})

const names = () =>
  within(screen.getByRole('list', { name: 'Achievements' }))
    .getAllByRole('listitem')
    .map((row) => row.querySelector('p')?.textContent)

describe('GameDetail', () => {
  it('asks for the game it was opened with, and shows loading until it arrives', () => {
    getGame.mockReturnValue(new Promise(() => {}))
    renderScrolled(<GameDetail id={7} onBack={onBack} />)

    expect(getGame).toHaveBeenCalledWith(7)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('says so, with a way back, when the game no longer exists', async () => {
    getGame.mockResolvedValue(null)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)

    expect(await screen.findByText('This game is no longer in your library.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows the title, the counts, the rarest achievement held and the progress bar', async () => {
    getGame.mockResolvedValue(DETAIL)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)

    expect(await screen.findByRole('heading', { name: 'Elden Ring' })).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('2 achievements left')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getAllByText('Achievement 2')).toHaveLength(2)
  })

  it('lists achievements rarest first, and filters unlocked and locked ones', async () => {
    getGame.mockResolvedValue(DETAIL)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    expect(names()).toEqual([
      'Achievement 3',
      'Achievement 2',
      'Hidden achievement',
      'Achievement 1',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Unlocked 2' }))
    expect(names()).toEqual(['Achievement 2', 'Achievement 1'])

    fireEvent.click(screen.getByRole('button', { name: 'Locked 2' }))
    expect(names()).toEqual(['Achievement 3', 'Hidden achievement'])
  })

  it('finds achievements by name or description, but never by a hidden one', async () => {
    getGame.mockResolvedValue(DETAIL)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })
    const search = screen.getByRole('searchbox', { name: 'Search achievements' })

    fireEvent.change(search, { target: { value: 'THING 3' } })
    expect(names()).toEqual(['Achievement 3'])

    fireEvent.change(search, { target: { value: 'achievement' } })
    expect(names()).toEqual(['Achievement 3', 'Achievement 2', 'Achievement 1'])
    expect(
      within(screen.getByRole('group', { name: 'Show' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['All 3', 'Unlocked 2', 'Locked 1'])
  })

  it('says when no achievement matches the search', async () => {
    getGame.mockResolvedValue(DETAIL)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search achievements' }), {
      target: { value: 'zzz' },
    })

    expect(screen.getByRole('status')).toHaveTextContent('No achievements match “zzz”.')
  })

  it('says when a filter leaves nothing to show', async () => {
    const all = entry().achievements.map((a) => ({ ...a, unlocked: true }))
    getGame.mockResolvedValue({ ...DETAIL, entries: [entry({ achievements: all })] })
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    fireEvent.click(screen.getByRole('button', { name: 'Locked 0' }))

    expect(screen.getByRole('status')).toHaveTextContent('No achievements to show here.')
  })

  it('sorts by the latest unlock, locked ones last, or by name', async () => {
    const zeta = achievement(5, {
      name: 'Zeta',
      globalPercent: 60,
      unlocked: true,
      unlockedAt: new Date(2026, 4, 1),
    })
    getGame.mockResolvedValue({
      ...DETAIL,
      entries: [entry({ achievements: [...entry().achievements, zeta] })],
    })
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })
    const sortBy = within(screen.getByRole('group', { name: 'Sort by' }))
    expect(sortBy.getByRole('button', { name: 'Rarest' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(sortBy.getByRole('button', { name: 'Latest unlocked' }))
    expect(names()).toEqual([
      'Zeta',
      'Achievement 1',
      'Achievement 2',
      'Achievement 3',
      'Hidden achievement',
    ])

    fireEvent.click(sortBy.getByRole('button', { name: 'Name' }))
    expect(names()).toEqual([
      'Achievement 1',
      'Achievement 2',
      'Achievement 3',
      'Hidden achievement',
      'Zeta',
    ])
  })

  it('reloads when the main process says the data changed', async () => {
    const three = entry().achievements.map((a) => ({ ...a, unlocked: a.id !== 4 }))
    getGame
      .mockResolvedValueOnce(DETAIL)
      .mockResolvedValueOnce({ ...DETAIL, entries: [entry({ achievements: three, unlocked: 3 })] })
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByText('2 / 4')

    act(() => dataChanged())

    expect(await screen.findByText('3 / 4')).toBeInTheDocument()
  })

  it('says when the achievements have not been read yet', async () => {
    getGame.mockResolvedValue({
      game: { ...DETAIL.game, unlocked: 0, total: 0 },
      entries: [entry({ achievements: [], unlocked: 0, total: 0 })],
    })
    renderScrolled(<GameDetail id={7} onBack={onBack} />)

    expect(await screen.findByText(/achievements haven't been read yet/)).toBeInTheDocument()
  })

  it('shows no platform tabs and no Unlink button for a game on one platform', async () => {
    getGame.mockResolvedValue(DETAIL)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Unlink/ })).not.toBeInTheDocument()
  })

  it('shows a tab per platform entry with its progress, opening on the best one', async () => {
    getGame.mockResolvedValue(LINKED)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    expect(screen.getByText('PlayStation · Steam')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'PlayStation · PS51 / 1',
      'Steam2 / 4',
      'PlayStation · PS40 / 2',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Elden Lord')
  })

  it("shows the chosen tab's achievements and counts", async () => {
    getGame.mockResolvedValue(LINKED)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    fireEvent.click(screen.getByRole('tab', { name: /PS4/ }))

    expect(screen.getByRole('tab', { name: /PS4/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Roundtable Hold')
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent('Elden Lord')
    expect(within(screen.getByRole('tabpanel')).getByText('0 / 2')).toBeInTheDocument()
  })

  it('opens on the entry it was asked to, such as the platform of a clicked unlock', async () => {
    getGame.mockResolvedValue(LINKED)
    renderScrolled(<GameDetail id={7} initialEntry={70} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    expect(screen.getByRole('tab', { name: /Steam/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('unlinks the shown platform, then reloads', async () => {
    getGame.mockResolvedValueOnce(LINKED).mockResolvedValueOnce(DETAIL)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    fireEvent.click(screen.getByRole('tab', { name: /PS4/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Unlink PlayStation · PS4' }))

    await vi.waitFor(() => expect(getGame).toHaveBeenCalledTimes(2))
    expect(unlinkGame).toHaveBeenCalledWith({ platformGameId: 72 })
    await vi.waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument())
  })

  it('finds another game by name, ignoring case and accents, and links it into this one', async () => {
    getGame.mockResolvedValue(DETAIL)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    fireEvent.click(screen.getByRole('button', { name: 'Link another game…' }))
    const search = await screen.findByRole('searchbox', { name: /Find the same game/ })
    fireEvent.change(search, { target: { value: 'ELDEN' } })

    const results = await screen.findByRole('list', { name: 'Matching games' })
    expect(
      within(results)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Elden Ring NightreignXbox'])

    fireEvent.change(search, { target: { value: 'ragnarok' } })
    fireEvent.click(await screen.findByRole('button', { name: /Ragnarök Tales/ }))

    await vi.waitFor(() => expect(mergeGames).toHaveBeenCalledWith({ intoGameId: 7, gameId: 9 }))
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('searchbox', { name: /Find the same game/ }),
      ).not.toBeInTheDocument(),
    )
    expect(getGame).toHaveBeenCalledTimes(2)
  })

  it('says when no other game matches, and closes the search on Cancel', async () => {
    getGame.mockResolvedValue(DETAIL)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    fireEvent.click(screen.getByRole('button', { name: 'Link another game…' }))
    fireEvent.change(await screen.findByRole('searchbox', { name: /Find the same game/ }), {
      target: { value: 'Portal' },
    })

    expect(
      await screen.findByText('No other game in your library matches “Portal”.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('searchbox', { name: /Find the same game/ })).not.toBeInTheDocument()
  })

  it('shows an error if changing a link fails', async () => {
    getGame.mockResolvedValue(LINKED)
    unlinkGame.mockRejectedValue(new Error('IPC broke'))
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    fireEvent.click(screen.getByRole('button', { name: /Unlink/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })
})

describe('GameDetail: syncing', () => {
  it('syncs this game on request, showing it is busy, then reloads it', async () => {
    let finish: () => void = () => undefined
    const syncNow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    window.api = fakeApi({ getGame, syncNow })
    getGame.mockResolvedValue(DETAIL)
    renderScrolled(<GameDetail id={7} onBack={onBack} />)
    await screen.findByRole('heading', { name: 'Elden Ring' })

    fireEvent.click(screen.getByRole('button', { name: 'Sync this game' }))

    expect(syncNow).toHaveBeenCalledWith({ kind: 'game', gameId: 7 })
    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled()
    act(() => finish())
    expect(await screen.findByRole('button', { name: 'Sync this game' })).toBeEnabled()
    expect(getGame).toHaveBeenCalledTimes(2)
  })
})
