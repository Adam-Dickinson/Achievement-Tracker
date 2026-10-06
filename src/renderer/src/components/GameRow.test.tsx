// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryGame } from '@shared/library'
import { GameRow } from './GameRow'

afterEach(cleanup)

function game(overrides: Partial<LibraryGame> = {}): LibraryGame {
  return {
    id: 7,
    title: 'Portal',
    platforms: ['steam'],
    coverUrl: 'https://cover/400.jpg',
    unlocked: 34,
    total: 42,
    lastUnlockAt: null,
    ...overrides,
  }
}

describe('GameRow', () => {
  it('shows the title, platform, counts, completion and what is left', () => {
    render(<GameRow game={game()} onOpen={vi.fn()} />)

    const row = screen.getByRole('button')
    expect(row).toHaveTextContent('Portal')
    expect(within(row).getByRole('img', { name: 'Steam' })).toBeInTheDocument()
    expect(row).toHaveTextContent('34 / 42')
    expect(row).toHaveTextContent('8 left')
    expect(row).toHaveTextContent('80%')
  })

  it('shows the playtime, marked when the total may be incomplete', () => {
    render(
      <GameRow
        game={game({ playtimeSeconds: 42 * 3600, playtimePartial: true })}
        onOpen={vi.fn()}
      />,
    )

    const row = screen.getByRole('button')
    expect(row).toHaveTextContent('42h+')
    expect(within(row).getByText('42 hours played, may be incomplete')).toBeInTheDocument()
  })

  it('shows no playtime when the platforms report none', () => {
    render(<GameRow game={game()} onOpen={vi.fn()} />)

    expect(screen.getByRole('button')).not.toHaveTextContent(/played/i)
  })

  it('says when the last unlock was', () => {
    const today = new Date()
    today.setHours(13, 42, 0, 0)
    render(<GameRow game={game({ lastUnlockAt: today })} onOpen={vi.fn()} />)

    expect(screen.getByRole('button')).toHaveTextContent('Last unlock')
    expect(screen.getByText(/^Today, /)).toBeInTheDocument()
  })

  it('says when nothing is unlocked yet', () => {
    render(<GameRow game={game({ unlocked: 0 })} onOpen={vi.fn()} />)

    expect(screen.getByText('No unlocks yet')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveTextContent('0%')
  })

  it('marks a finished game as completed', () => {
    render(<GameRow game={game({ unlocked: 42 })} onOpen={vi.fn()} />)

    expect(screen.getByRole('button')).toHaveTextContent('100%')
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('says a game is not read yet before its first sync', () => {
    render(<GameRow game={game({ unlocked: 0, total: 0 })} onOpen={vi.fn()} />)

    expect(screen.getByText('Not read yet')).toBeInTheDocument()
    expect(screen.getByText('–')).toBeInTheDocument()
  })

  it('opens the game when clicked', () => {
    const onOpen = vi.fn()
    render(<GameRow game={game()} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(7)
  })
})
