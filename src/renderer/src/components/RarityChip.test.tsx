// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'
import { RarityChip } from './RarityChip'

afterEach(cleanup)

const RARITIES = Object.keys(RARITY_LABEL) as Rarity[]

describe('RarityChip', () => {
  it.each(RARITIES)('names the rarity in words, with a decorative gem, for %s', (rarity) => {
    render(<RarityChip rarity={rarity} />)

    const chip = screen.getByText(RARITY_LABEL[rarity])
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it.each(RARITIES)('joins the rarity colour scope for %s', (rarity) => {
    render(<RarityChip rarity={rarity} />)

    expect(screen.getByText(RARITY_LABEL[rarity])).toHaveAttribute('data-rarity', rarity)
  })

  it('gives only ultra rare a glow', () => {
    for (const rarity of RARITIES) {
      const { unmount } = render(<RarityChip rarity={rarity} />)
      const chip = screen.getByText(RARITY_LABEL[rarity])

      if (rarity === 'ultra_rare') expect(chip).toHaveClass('shadow-chip-ultra')
      else expect(chip).not.toHaveClass('shadow-chip-ultra')
      unmount()
    }
  })

  it('passes className through so callers can position it', () => {
    render(<RarityChip rarity="rare" className="ml-auto" />)

    expect(screen.getByText('Rare')).toHaveClass('ml-auto')
  })
})
