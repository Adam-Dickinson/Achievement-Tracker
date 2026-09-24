// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryGame } from '@shared/library'
import { fakeApi } from '@/test/fake-api'
import { Library } from './Library'

function game(id: number, title: string, unlocked: number, total: number): LibraryGame {
  return {
    id,
    title,
    platform: 'steam',
    coverUrl: `https://cover/${id}.jpg`,
    unlocked,
    total,
    lastUnlockAt: null,
  }
}

const GAMES = [game(1, 'Portal', 5, 10), game(2, 'Celeste', 10, 10), game(3, 'Hades', 0, 0)]

const listLibrary = vi.fn<() => Promise<LibraryGame[]>>()
let dataChanged: () => void = () => {}
const onOpenGame = vi.fn()

beforeEach(() => {
  window.api = fakeApi({
    listLibrary,
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

const titles = () =>
  within(screen.getByRole('list'))
    .getAllByRole('button')
    .map((card) => card.querySelector('span.truncate')?.textContent)

describe('Library', () => {
  it('shows a loading status until the main process replies', () => {
    listLibrary.mockReturnValue(new Promise(() => {}))
    render(<Library onOpenGame={onOpenGame} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('points to the Accounts screen when there are no games', async () => {
    listLibrary.mockResolvedValue([])
    render(<Library onOpenGame={onOpenGame} />)

    expect(await screen.findByRole('status')).toHaveTextContent('Connect an account')
  })

  it('shows every game in the order it arrives, with the count', async () => {
    listLibrary.mockResolvedValue(GAMES)
    render(<Library onOpenGame={onOpenGame} />)

    expect(await screen.findByText('3 games')).toBeInTheDocument()
    expect(titles()).toEqual(['Portal', 'Celeste', 'Hades'])
  })

  it('sorts by completion or by name when asked', async () => {
    listLibrary.mockResolvedValue(GAMES)
    render(<Library onOpenGame={onOpenGame} />)
    await screen.findByText('3 games')

    fireEvent.click(screen.getByRole('button', { name: 'Completion' }))
    expect(titles()).toEqual(['Celeste', 'Portal', 'Hades'])
    expect(screen.getByRole('button', { name: 'Completion' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(titles()).toEqual(['Celeste', 'Hades', 'Portal'])
  })

  it('opens a game when its card is clicked', async () => {
    listLibrary.mockResolvedValue(GAMES)
    render(<Library onOpenGame={onOpenGame} />)

    fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))

    expect(onOpenGame).toHaveBeenCalledWith(2)
  })

  it('reloads when the main process says the data changed', async () => {
    listLibrary
      .mockResolvedValueOnce([game(1, 'Portal', 0, 0)])
      .mockResolvedValueOnce([game(1, 'Portal', 3, 10)])
    render(<Library onOpenGame={onOpenGame} />)
    expect(await screen.findByText('Syncing…')).toBeInTheDocument()

    act(() => dataChanged())

    expect(await screen.findByText('30%')).toBeInTheDocument()
  })
})
