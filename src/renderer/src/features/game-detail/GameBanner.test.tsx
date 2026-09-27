// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { LibraryGame } from '@shared/library'
import { GameBanner } from './GameBanner'

afterEach(cleanup)

function game(overrides: Partial<LibraryGame> = {}): LibraryGame {
  return {
    id: 7,
    title: 'Elden Ring',
    platforms: ['steam', 'xbox'],
    coverUrl: 'https://cover/7.jpg',
    unlocked: 1,
    total: 2,
    lastUnlockAt: null,
    ...overrides,
  }
}

describe('GameBanner', () => {
  it('titles the page with the game, its platforms and the given controls', () => {
    const { container } = render(
      <GameBanner
        game={game()}
        back={<button type="button">Library</button>}
        actions={<button type="button">Open in Steam</button>}
      />,
    )

    const banner = screen.getByRole('region', { name: 'Elden Ring' })
    expect(within(banner).getByRole('heading', { level: 1 })).toHaveTextContent('Elden Ring')
    expect(
      within(banner)
        .getAllByRole('img')
        .map((badge) => badge.getAttribute('aria-label')),
    ).toEqual(['Steam', 'Xbox'])
    expect(banner).toHaveTextContent('Steam · Xbox')
    expect(within(banner).getByRole('button', { name: 'Library' })).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Open in Steam' })).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cover/7.jpg')
  })

  it('prefers the wide hero art to the cover', () => {
    const { container } = render(
      <GameBanner game={game({ heroUrl: 'https://hero/7.jpg' })} back={null} actions={null} />,
    )

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://hero/7.jpg')
  })

  it('uses the generated gradient when the game has no art', () => {
    const { container } = render(
      <GameBanner game={game({ coverUrl: null })} back={null} actions={null} />,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.bg-linear-140')).not.toBeNull()
  })
})
