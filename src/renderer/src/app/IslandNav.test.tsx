// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '@/test/fake-api'
import { NAV_ITEMS, type PageId } from './navigation'
import { IslandNav } from './IslandNav'

beforeEach(() => {
  window.api = fakeApi()
})

afterEach(cleanup)

interface Options {
  selected?: PageId
  onSelect?: (page: PageId) => void
  name?: string
  query?: string
  onSearch?: (query: string) => void
}

function renderNav({
  selected = 'dashboard',
  onSelect = () => {},
  name = 'Adam',
  query = '',
  onSearch = () => {},
}: Options = {}) {
  return render(
    <IslandNav
      selected={selected}
      onSelect={onSelect}
      name={name}
      query={query}
      onSearch={onSearch}
    />,
  )
}

describe('IslandNav', () => {
  it('offers one button per page inside a "Main" navigation landmark', () => {
    renderNav()

    const nav = screen.getByRole('navigation', { name: 'Main' })
    const labels = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(labels).toEqual(NAV_ITEMS.map((item) => item.label))
  })

  it('marks only the selected page as current', () => {
    renderNav({ selected: 'activity' })

    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-current', 'page')
    for (const item of NAV_ITEMS.filter((nav) => nav.id !== 'activity')) {
      expect(screen.getByRole('button', { name: item.label })).not.toHaveAttribute('aria-current')
    }
  })

  it.each(NAV_ITEMS)('reports the page id when $label is clicked', (item) => {
    const onSelect = vi.fn()
    renderNav({ onSelect })

    fireEvent.click(screen.getByRole('button', { name: item.label }))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(item.id)
  })

  it('shows the Trophy Locker wordmark beside a decorative logo', () => {
    const { container } = renderNav()

    expect(screen.getByText('Trophy Locker')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it("shows the user's initial in the avatar, named after them", () => {
    renderNav({ name: 'ada' })

    const avatar = screen.getByRole('img', { name: 'ada' })
    expect(avatar).toHaveTextContent('A')
    expect(avatar).toHaveAttribute('title', 'ada')
  })

  it('shows a plain avatar while the name is unknown', () => {
    renderNav({ name: '' })

    expect(screen.queryByRole('img', { name: /./ })).not.toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })

  it('shows the library search and reports what is typed', () => {
    const onSearch = vi.fn()
    renderNav({ query: 'port', onSearch })

    const search = screen.getByRole('searchbox', { name: 'Search library' })
    expect(search).toHaveValue('port')

    fireEvent.change(search, { target: { value: 'portal' } })

    expect(onSearch).toHaveBeenCalledExactlyOnceWith('portal')
  })

  it.each([
    ['Ctrl+K', { ctrlKey: true }],
    ['Cmd+K', { metaKey: true }],
  ])('focuses the search on %s', (_label, modifiers) => {
    renderNav()

    fireEvent.keyDown(window, { key: 'k', ...modifiers })

    expect(screen.getByRole('searchbox', { name: 'Search library' })).toHaveFocus()
  })

  it('leaves the focus alone on K without Ctrl', () => {
    renderNav()

    fireEvent.keyDown(window, { key: 'k' })

    expect(screen.getByRole('searchbox', { name: 'Search library' })).not.toHaveFocus()
  })

  it('stops listening for Ctrl+K once it is gone', () => {
    const { unmount } = renderNav()
    const remove = vi.spyOn(window, 'removeEventListener')

    unmount()

    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function))
    remove.mockRestore()
  })

  it('shows the sync status and the notifications bell', async () => {
    renderNav()

    expect(await screen.findByRole('button', { name: 'Connect an account' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Pause notifications' })).toBeEnabled()
  })

  it('opens Accounts from the sync status when no account is connected', async () => {
    const onSelect = vi.fn()
    renderNav({ onSelect })

    fireEvent.click(await screen.findByRole('button', { name: 'Connect an account' }))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('accounts')
  })
})
