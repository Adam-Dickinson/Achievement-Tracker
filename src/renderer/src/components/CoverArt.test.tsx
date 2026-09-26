// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CoverArt, paletteFor } from './CoverArt'

afterEach(cleanup)

describe('paletteFor', () => {
  it('always gives a title the same colours', () => {
    expect(paletteFor('Death Stranding')).toBe(paletteFor('Death Stranding'))
  })

  it('spreads titles across more than one palette', () => {
    const palettes = new Set(
      ['Portal', 'Doom', 'Hades', 'Celeste', 'Terraria', 'Minecraft', 'Halo'].map(paletteFor),
    )
    expect(palettes.size).toBeGreaterThan(1)
  })
})

describe('CoverArt', () => {
  it('colours in a generated cover up to the completion, like a real one', () => {
    const { container } = render(<CoverArt url={null} title="Death Stranding" percent={40} />)

    const faces = container.querySelectorAll('[aria-hidden="true"]')
    const [grey, colour] = [...faces]
    expect(grey).toHaveTextContent('Death Stranding')
    expect(grey).toHaveClass('grayscale')
    expect(colour).toHaveTextContent('Death Stranding')
    expect(colour).toHaveStyle({ clipPath: 'inset(0 60% 0 0)' })
  })

  it('draws the progress edge only while a game is part done', () => {
    const edge = (percent: number) =>
      render(<CoverArt url={null} title="Doom" percent={percent} />).container.querySelector(
        '.shadow-glow-primary',
      )

    expect(edge(0)).toBeNull()
    cleanup()
    expect(edge(100)).toBeNull()
    cleanup()
    expect(edge(50)).not.toBeNull()
  })
})
