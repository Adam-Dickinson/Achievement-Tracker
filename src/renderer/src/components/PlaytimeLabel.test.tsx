// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlaytimeLabel } from './PlaytimeLabel'

afterEach(cleanup)

describe('PlaytimeLabel', () => {
  it('shows the hours played, with the full wording for screen readers', () => {
    const { container } = render(<PlaytimeLabel seconds={42 * 3600} />)

    expect(container).toHaveTextContent('42h')
    expect(screen.getByText('42 hours played')).toBeInTheDocument()
  })

  it('shows a plus and says the total may be incomplete when partial', () => {
    const { container } = render(<PlaytimeLabel seconds={42 * 3600} partial />)

    expect(container).toHaveTextContent('42h+')
    expect(screen.getByText('42 hours played, may be incomplete')).toBeInTheDocument()
  })

  it('shows zero playtime as minutes', () => {
    const { container } = render(<PlaytimeLabel seconds={0} />)

    expect(container).toHaveTextContent('0m')
  })

  it('shows nothing when the platform reports no playtime', () => {
    const { container: none } = render(<PlaytimeLabel seconds={null} />)
    const { container: absent } = render(<PlaytimeLabel seconds={undefined} />)

    expect(none).toBeEmptyDOMElement()
    expect(absent).toBeEmptyDOMElement()
  })
})
