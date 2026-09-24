// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'
import { RarityGem } from './RarityGem'

afterEach(cleanup)

const RARITIES = Object.keys(RARITY_LABEL) as Rarity[]

function renderGem(rarity: Rarity, className?: string) {
  const { container, unmount } = render(<RarityGem rarity={rarity} className={className} />)
  const svg = container.querySelector('svg')
  const markup = container.innerHTML
  return { svg, markup, unmount }
}

describe('RarityGem', () => {
  it('is decorative for every rarity, because the rarity is always written out as text too', () => {
    for (const rarity of RARITIES) {
      const { svg, unmount } = renderGem(rarity)
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      unmount()
    }
  })

  it('draws a different shape for each rarity', () => {
    const shapes = RARITIES.map((rarity) => {
      const { markup, unmount } = renderGem(rarity)
      unmount()
      return markup
    })
    expect(new Set(shapes).size).toBe(RARITIES.length)
  })

  it('takes its colour from the surrounding text colour, so callers can use text-* classes', () => {
    const { svg } = renderGem('rare')
    expect(svg).toHaveAttribute('fill', 'currentColor')
  })

  it('passes className through so callers can size it', () => {
    const { svg } = renderGem('ultra_rare', 'size-3')
    expect(svg).toHaveClass('size-3')
  })
})
