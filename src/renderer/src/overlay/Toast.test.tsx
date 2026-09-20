// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
})
