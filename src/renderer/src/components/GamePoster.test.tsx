// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryGame } from '@shared/library'
import { GamePoster } from './GamePoster'

afterEach(cleanup)

function game(overrides: Partial<LibraryGame> = {}): LibraryGame {
  return {
    id: 7,
    title: 'Portal',
    platforms: ['steam', 'xbox'],
    coverUrl: 'https://cover/400.jpg',
    unlocked: 34,
    total: 42,
    lastUnlockAt: null,
    ...overrides,
  }
}

describe('GamePoster', () => {
  it('shows the title, platforms, completion and what is left', () => {
    render(<GamePoster game={game()} onOpen={vi.fn()} />)

    const poster = screen.getByRole('button')
    expect(poster).toHaveTextContent('Portal')
    expect(
      within(poster)
        .getAllByRole('img')
        .map((badge) => badge.getAttribute('aria-label')),
    ).toEqual(['Steam', 'Xbox'])
    expect(poster).toHaveTextContent('80%')
    expect(poster).toHaveTextContent('34 / 42 achievements')
    expect(poster).toHaveTextContent('8 left')
  })

  it('frames the landscape cover in a tall poster, over a blurred copy of it', () => {
    const { container } = render(<GamePoster game={game()} onOpen={vi.fn()} />)

    expect(container.querySelector('.aspect-2\\/3')).not.toBeNull()
    const images = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(images.every((src) => src === 'https://cover/400.jpg')).toBe(true)
    expect(container.querySelector('img.blur-xl')).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses a generated backdrop and cover when the game has no art', () => {
    const { container } = render(<GamePoster game={game({ coverUrl: null })} onOpen={vi.fn()} />)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('button')).toHaveTextContent('Portal')
  })

  it('marks a finished game as completed', () => {
    render(<GamePoster game={game({ unlocked: 42 })} onOpen={vi.fn()} />)

    expect(screen.getByRole('button')).toHaveTextContent('100%')
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('says a game is syncing until its achievements are read', () => {
    render(<GamePoster game={game({ unlocked: 0, total: 0 })} onOpen={vi.fn()} />)

    expect(screen.getByText('Syncing…')).toBeInTheDocument()
    expect(screen.getByText('Achievements not read yet')).toBeInTheDocument()
  })

  it('opens the game when clicked', () => {
    const onOpen = vi.fn()
    render(<GamePoster game={game()} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(7)
  })
})
