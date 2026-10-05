// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToggleGroup } from './ToggleGroup'

afterEach(cleanup)

describe('ToggleGroup', () => {
  it('selects an option when it is clicked', () => {
    const onSelect = vi.fn()
    render(
      <ToggleGroup
        label="Mode"
        options={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        selected="a"
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'B' }))

    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('does not select a disabled option', () => {
    const onSelect = vi.fn()
    render(
      <ToggleGroup
        label="Mode"
        options={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B', disabled: true },
        ]}
        selected="a"
        onSelect={onSelect}
      />,
    )

    const button = screen.getByRole('button', { name: 'B' })
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
