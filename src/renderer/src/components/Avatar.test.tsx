// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

afterEach(cleanup)

describe('Avatar', () => {
  it("shows the name's first letter in capitals, named after the person", () => {
    render(<Avatar name="adam" />)

    const avatar = screen.getByRole('img', { name: 'adam' })
    expect(avatar).toHaveTextContent('A')
    expect(avatar).toHaveAttribute('title', 'adam')
  })

  it('keeps a first letter made of two code units whole', () => {
    render(<Avatar name="𝒜da" />)

    expect(screen.getByRole('img', { name: '𝒜da' })).toHaveTextContent(/^𝒜$/u)
  })

  it('shows a decorative person icon without a name', () => {
    const { container } = render(<Avatar name="" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
