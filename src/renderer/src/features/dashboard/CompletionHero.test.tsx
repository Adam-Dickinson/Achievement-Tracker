// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompletionHero } from './CompletionHero'

afterEach(cleanup)

describe('CompletionHero', () => {
  it('shows the rounded percentage and the grouped unlocked/total counts', () => {
    render(<CompletionHero unlocked={3482} total={5120} />)

    expect(screen.getByText('68%')).toBeInTheDocument()
    // Grouping follows the machine's locale (e.g. "3,482" or "3 482" with a non-breaking space).
    // A RegExp matcher is applied to the raw (non-normalized) text content, so normalize the
    // locale's grouping character to a plain space ourselves before building the pattern.
    const unlocked = (3482).toLocaleString().replace(/\s/g, ' ')
    const total = (5120).toLocaleString().replace(/\s/g, ' ')
    expect(screen.getByText(new RegExp(unlocked))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(total))).toBeInTheDocument()
  })

  it('exposes the percentage as an accessible progress bar, not colour alone', () => {
    render(<CompletionHero unlocked={3482} total={5120} />)

    const bar = screen.getByRole('progressbar', { name: 'Total completion' })
    expect(bar).toHaveAttribute('aria-valuenow', '68')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('sizes the fill bar to the percentage', () => {
    render(<CompletionHero unlocked={25} total={100} />)

    const bar = screen.getByRole('progressbar')
    expect(bar.firstElementChild).toHaveStyle({ width: '25%' })
  })

  it('never shows 100% unless every achievement is unlocked', () => {
    render(<CompletionHero unlocked={9999} total={10000} />)

    expect(screen.getByText('99%')).toBeInTheDocument()
  })

  it('shows 0% for an empty library instead of NaN', () => {
    render(<CompletionHero unlocked={0} total={0} />)

    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
