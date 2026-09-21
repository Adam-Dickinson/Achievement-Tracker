// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'
import { Toast } from './Toast'

afterEach(cleanup)

describe('Toast', () => {
  it('shows the achievement, its game and platform, and a rarity label', () => {
    render(
      <Toast
        rarity="ultra_rare"
        title="Lord of Frenzied Flame"
        description="Achieve the Lord of Frenzied Flame ending"
        game="Elden Ring"
        platform="Steam"
        percent={1.4}
      />,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Lord of Frenzied Flame')).toBeInTheDocument()
    expect(screen.getByText('Elden Ring · Steam')).toBeInTheDocument()
    // Rarity is always shown as text, never by colour alone.
    expect(screen.getByText('Ultra Rare')).toBeInTheDocument()
    expect(screen.getByText('1.4%')).toBeInTheDocument()
  })

  it('labels every rarity in words, never by colour alone', () => {
    for (const rarity of Object.keys(RARITY_LABEL) as Rarity[]) {
      const { unmount } = render(
        <Toast
          rarity={rarity}
          title="Fleet Footed"
          description="Win a race using only the starter car"
          game="Forza Horizon 5"
          platform="Xbox"
          percent={18.5}
        />,
      )
      expect(screen.getByText(RARITY_LABEL[rarity])).toBeInTheDocument()
      unmount()
    }
  })

  it('opens with "Achievement unlocked" and a rarity gem beside it', () => {
    render(
      <Toast
        rarity="rare"
        title="Platinum Trophy"
        description="Earn all other trophies"
        game="God of War"
        platform="PlayStation"
        percent={2.8}
      />,
    )

    const heading = screen.getByText('Achievement unlocked')
    expect(heading.querySelector('svg')).not.toBeNull()
  })
})
