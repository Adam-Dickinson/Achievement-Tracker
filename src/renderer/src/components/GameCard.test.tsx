// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryGame } from '@shared/library'
import { GameCard } from './GameCard'

afterEach(cleanup)

function game(overrides: Partial<LibraryGame> = {}): LibraryGame {
  return {
    id: 7,
    title: 'Portal',
    platform: 'steam',
    coverUrl: 'https://cover/400.jpg',
    unlocked: 34,
    total: 42,
    lastUnlockAt: null,
    ...overrides,
  }
}

describe('GameCard', () => {
  it('shows the title, platform, completion and what is left', () => {
    render(<GameCard game={game()} onOpen={vi.fn()} />)

    const card = screen.getByRole('button')
    expect(card).toHaveTextContent('Portal')
    expect(card).toHaveTextContent('Steam')
    expect(card).toHaveTextContent('80%')
    expect(card).toHaveTextContent('34 / 42 achievements')
    expect(card).toHaveTextContent('8 left')
  })

  it('marks a finished game as completed', () => {
    render(<GameCard game={game({ unlocked: 42 })} onOpen={vi.fn()} />)

    expect(screen.getByRole('button')).toHaveTextContent('100%')
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('says a game is still syncing before its achievements have been read', () => {
    const { container } = render(
      <GameCard game={game({ unlocked: 0, total: 0 })} onOpen={vi.fn()} />,
    )

    // 0 of 0 is not a finished game: no crown.
    expect(container.querySelector('svg')).toBeNull()

    expect(screen.getByText('Syncing…')).toBeInTheDocument()
    expect(screen.getByText('Achievements not read yet')).toBeInTheDocument()
    expect(screen.queryByText('Completed')).not.toBeInTheDocument()
  })

  it('colours the art in up to the completion point', () => {
    const { container } = render(<GameCard game={game({ unlocked: 21 })} onOpen={vi.fn()} />)

    const [grey, colour] = container.querySelectorAll('img')
    expect(grey).toHaveAttribute('src', 'https://cover/400.jpg')
    expect(colour).toHaveStyle({ clipPath: 'inset(0 50% 0 0)' })
  })

  it('shows the title instead of art when there is no image, or it fails to load', () => {
    const { container, rerender } = render(
      <GameCard game={game({ coverUrl: null })} onOpen={vi.fn()} />,
    )
    expect(container.querySelector('img')).toBeNull()

    rerender(<GameCard game={game({ id: 8 })} onOpen={vi.fn()} key="other" />)
    const img = container.querySelector('img')
    if (!img) throw new Error('expected the cover image')
    fireEvent.error(img)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getAllByText('Portal')).toHaveLength(2)
  })

  it('opens the game when clicked', () => {
    const onOpen = vi.fn()
    render(<GameCard game={game()} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onOpen).toHaveBeenCalledWith(7)
  })
})
