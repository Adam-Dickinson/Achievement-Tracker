// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameAchievement, GameDetail as GameDetailData } from '@shared/library'
import { fakeApi } from '@/test/fake-api'
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

const DETAIL: GameDetailData = {
  game: {
    id: 7,
    title: 'Elden Ring',
    platform: 'steam',
    coverUrl: 'https://cover/7.jpg',
    unlocked: 2,
    total: 4,
    lastUnlockAt: new Date(2026, 2, 9, 12, 0),
  },
  achievements: [
    achievement(1, { globalPercent: 40, unlocked: true, unlockedAt: new Date(2026, 2, 9, 12, 0) }),
    achievement(2, { globalPercent: 1.2, unlocked: true, unlockedAt: null }),
    achievement(3, { globalPercent: 0.5 }),
    achievement(4, { hidden: true, description: null, globalPercent: 8 }),
  ],
}

const getGame = vi.fn<(id: number) => Promise<GameDetailData | null>>()
let dataChanged: () => void = () => {}
const onBack = vi.fn()

beforeEach(() => {
  window.api = fakeApi({
    getGame,
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

const names = () =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((row) => row.querySelector('p')?.textContent)

describe('GameDetail', () => {
  it('asks for the game it was opened with, and shows loading until it arrives', () => {
    getGame.mockReturnValue(new Promise(() => {}))
    render(<GameDetail id={7} onBack={onBack} />)

    expect(getGame).toHaveBeenCalledWith(7)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('says so, with a way back, when the game no longer exists', async () => {
    getGame.mockResolvedValue(null)
    render(<GameDetail id={7} onBack={onBack} />)

    expect(await screen.findByText('This game is no longer in your library.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows the title, the counts, the rarest achievement held and the progress bar', async () => {
    getGame.mockResolvedValue(DETAIL)
    render(<GameDetail id={7} onBack={onBack} />)

    expect(await screen.findByRole('heading', { name: 'Elden Ring' })).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('2 achievements left')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getAllByText('Achievement 2')).toHaveLength(2)
  })

  it('lists achievements rarest first, and filters unlocked and locked ones', async () => {
    getGame.mockResolvedValue(DETAIL)
    render(<GameDetail id={7} onBack={onBack} />)
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

  it('reloads when the main process says the data changed', async () => {
    getGame.mockResolvedValueOnce(DETAIL).mockResolvedValueOnce({
      ...DETAIL,
      game: { ...DETAIL.game, unlocked: 3 },
    })
    render(<GameDetail id={7} onBack={onBack} />)
    await screen.findByText('2 / 4')

    act(() => dataChanged())

    expect(await screen.findByText('3 / 4')).toBeInTheDocument()
  })

  it('says when the achievements have not been read yet', async () => {
    getGame.mockResolvedValue({ game: { ...DETAIL.game, unlocked: 0, total: 0 }, achievements: [] })
    render(<GameDetail id={7} onBack={onBack} />)

    expect(await screen.findByText(/achievements haven't been read yet/)).toBeInTheDocument()
  })
})
