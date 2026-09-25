// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NAV_ITEMS } from './navigation'
import { IslandNav } from './IslandNav'

afterEach(cleanup)

const INFO = { version: '0.1.0', schemaVersion: 1 }

describe('IslandNav', () => {
  it('offers one button per page inside a "Main" navigation landmark', () => {
    render(<IslandNav selected="dashboard" onSelect={() => {}} info={INFO} />)

    const nav = screen.getByRole('navigation', { name: 'Main' })
    const labels = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(labels).toEqual(NAV_ITEMS.map((item) => item.label))
  })

  it('marks only the selected page as current', () => {
    render(<IslandNav selected="activity" onSelect={() => {}} info={INFO} />)

    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-current', 'page')
    for (const item of NAV_ITEMS.filter((nav) => nav.id !== 'activity')) {
      expect(screen.getByRole('button', { name: item.label })).not.toHaveAttribute('aria-current')
    }
  })

  it.each(NAV_ITEMS)('reports the page id when $label is clicked', (item) => {
    const onSelect = vi.fn()
    render(<IslandNav selected="dashboard" onSelect={onSelect} info={INFO} />)

    fireEvent.click(screen.getByRole('button', { name: item.label }))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(item.id)
  })

  it('shows the Trophy Locker wordmark beside a decorative logo', () => {
    const { container } = render(<IslandNav selected="dashboard" onSelect={() => {}} info={INFO} />)

    expect(screen.getByText('Trophy Locker')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('shows the app and schema version once known', () => {
    render(<IslandNav selected="dashboard" onSelect={() => {}} info={INFO} />)

    expect(screen.getByText('v0.1.0 · schema 1')).toBeInTheDocument()
  })

  it('shows a starting message until the app info arrives', () => {
    render(<IslandNav selected="dashboard" onSelect={() => {}} info={null} />)

    expect(screen.getByText('Starting…')).toBeInTheDocument()
  })
})
