// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ArrowDownUp } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

afterEach(cleanup)

const OPTIONS = [
  { id: 'recent', label: 'Last unlock' },
  { id: 'title', label: 'Name' },
] as const

describe('Select', () => {
  it('is a labelled dropdown showing the chosen option', () => {
    render(
      <Select
        label="Sort by"
        icon={ArrowDownUp}
        options={OPTIONS}
        value="title"
        onChange={vi.fn()}
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Sort by' })
    expect(select).toHaveValue('title')
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Last unlock', 'Name'])
  })

  it('reports the id of the option picked', () => {
    const onChange = vi.fn()
    render(
      <Select
        label="Sort by"
        icon={ArrowDownUp}
        options={OPTIONS}
        value="recent"
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'title' } })

    expect(onChange).toHaveBeenCalledExactlyOnceWith('title')
  })
})
