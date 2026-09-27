// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatinumChip } from './PlatinumChip'

afterEach(cleanup)

describe('PlatinumChip', () => {
  it('says Platinum in words and takes the platinum colours', () => {
    render(<PlatinumChip className="extra" />)

    const chip = screen.getByText('Platinum')
    expect(chip).toHaveAttribute('data-platinum')
    expect(chip).toHaveClass('extra')
  })
})
