// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatTile } from './StatTile'

afterEach(cleanup)

describe('StatTile', () => {
  it('shows the label and a grouped value', () => {
    render(<StatTile label="Games tracked" value={3482} />)

    expect(screen.getByText('Games tracked')).toBeInTheDocument()
    expect(screen.getByText((3482).toLocaleString().replace(/\s/g, ' '))).toBeInTheDocument()
  })

  it('shows the hint when one is given', () => {
    render(<StatTile label="Completed games" value={27} hint="Platinums / 100%" />)

    expect(screen.getByText('Platinums / 100%')).toBeInTheDocument()
  })

  it('renders no hint text when none is given', () => {
    const { container } = render(<StatTile label="Games tracked" value={214} />)

    expect(container.querySelectorAll('span')).toHaveLength(2)
  })
})
