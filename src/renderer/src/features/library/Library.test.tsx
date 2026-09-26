// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryGame } from '@shared/library'
import type { Platform } from '@shared/platform'
import { fakeApi } from '@/test/fake-api'
import { fakeLayout, renderScrolled } from '@/test/layout'
import { Library } from './Library'
import { DEFAULT_VIEW, type LibraryView } from './library-view'

function game(
  id: number,
  title: string,
  unlocked: number,
  total: number,
  platforms: Platform[] = ['steam'],
): LibraryGame {
  return {
    id,
    title,
    platforms,
    coverUrl: `https://cover/${id}.jpg`,
    unlocked,
    total,
    lastUnlockAt: null,
  }
}

const GAMES = [
  game(1, 'Portal', 5, 10),
  game(2, 'Celeste', 10, 10, ['steam', 'playstation']),
  game(3, 'Hades', 0, 0, ['xbox']),
  game(4, 'Ōkami HD', 0, 20),
]

const listLibrary = vi.fn<() => Promise<LibraryGame[]>>()
let dataChanged: () => void = () => {}
const onOpenGame = vi.fn()
const onViewChange = vi.fn<(view: LibraryView) => void>()
let restoreLayout: () => void

beforeEach(() => {
  restoreLayout = fakeLayout()
  window.api = fakeApi({
    listLibrary,
    onDataChanged: (listener) => {
      dataChanged = listener
      return () => {}
    },
  })
})

afterEach(() => {
  cleanup()
  restoreLayout()
  vi.resetAllMocks()
})

function Harness({ restoreScrollTop }: { restoreScrollTop?: number }) {
  const [view, setView] = useState(DEFAULT_VIEW)
  return (
    <Library
      view={view}
      onViewChange={(next) => {
        onViewChange(next)
        setView(next)
      }}
      restoreScrollTop={restoreScrollTop}
      onOpenGame={onOpenGame}
    />
  )
}

async function renderLibrary(games: LibraryGame[] = GAMES) {
  listLibrary.mockResolvedValue(games)
  const result = renderScrolled(<Harness />)
  await screen.findByRole('list', { name: 'Games' })
  return result
}

const titles = () =>
  within(screen.getByRole('list', { name: 'Games' }))
    .getAllByRole('button')
    .map((card) => card.querySelector('span.truncate')?.textContent)

const group = (name: string) => screen.getByRole('group', { name })
const option = (groupName: string, name: string | RegExp) =>
  within(group(groupName)).getByRole('button', { name })
const optionNames = (groupName: string) =>
  within(group(groupName))
    .getAllByRole('button')
    .map((button) => button.textContent)

describe('Library', () => {
  it('shows a loading status until the main process replies', () => {
    listLibrary.mockReturnValue(new Promise(() => {}))
    renderScrolled(<Harness />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('points to the Accounts screen when there are no games', async () => {
    listLibrary.mockResolvedValue([])
    renderScrolled(<Harness />)

    expect(await screen.findByRole('status')).toHaveTextContent('Connect an account')
  })

  it('shows every game in the order it arrives, with the count', async () => {
    await renderLibrary()

    expect(screen.getByText('4 games')).toBeInTheDocument()
    expect(titles()).toEqual(['Portal', 'Celeste', 'Hades', 'Ōkami HD'])
  })

  it('sorts by completion, name or platform when asked', async () => {
    await renderLibrary()

    fireEvent.click(option('Sort by', 'Completion'))
    expect(titles()).toEqual(['Celeste', 'Portal', 'Ōkami HD', 'Hades'])
    expect(option('Sort by', 'Completion')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(option('Sort by', 'Name'))
    expect(titles()).toEqual(['Celeste', 'Hades', 'Ōkami HD', 'Portal'])

    fireEvent.click(option('Sort by', 'Platform'))
    expect(titles()).toEqual(['Celeste', 'Ōkami HD', 'Portal', 'Hades'])
  })

  it('finds games by any words of their title, ignoring case and accents', async () => {
    await renderLibrary()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search games' }), {
      target: { value: 'hd OKAMI' },
    })

    expect(titles()).toEqual(['Ōkami HD'])
    expect(screen.getByText('Showing 1 of 4 games')).toBeInTheDocument()
  })

  it('offers only the platforms in the library, each with its number of games', async () => {
    await renderLibrary()

    expect(optionNames('Platform')).toEqual(['All 4', 'Steam 3', 'Xbox 1', 'PlayStation 1'])
    expect(option('Platform', /^All/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the games on one platform, counting linked games on each of theirs', async () => {
    await renderLibrary()

    fireEvent.click(option('Platform', /^PlayStation/))

    expect(titles()).toEqual(['Celeste'])
    expect(screen.getByText('Showing 1 of 4 games')).toBeInTheDocument()
  })

  it('filters by progress, counting what each choice would show', async () => {
    await renderLibrary()

    expect(optionNames('Progress')).toEqual([
      'All 4',
      'In progress 1',
      'Not started 2',
      'Completed 1',
    ])

    fireEvent.click(option('Progress', /^In progress/))
    expect(titles()).toEqual(['Portal'])

    fireEvent.click(option('Progress', /^Not started/))
    expect(titles()).toEqual(['Hades', 'Ōkami HD'])

    fireEvent.click(option('Progress', /^Completed/))
    expect(titles()).toEqual(['Celeste'])
  })

  it('updates the counts on the other filters as the search narrows the games', async () => {
    await renderLibrary()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search games' }), {
      target: { value: 'celeste' },
    })

    expect(optionNames('Platform')).toEqual(['All 1', 'Steam 1', 'Xbox 0', 'PlayStation 1'])
    expect(optionNames('Progress')).toEqual([
      'All 1',
      'In progress 0',
      'Not started 0',
      'Completed 1',
    ])
  })

  it('says when nothing matches, and clears the filters but keeps the sort', async () => {
    await renderLibrary()
    fireEvent.click(option('Sort by', 'Name'))
    fireEvent.click(option('Platform', /^Xbox/))
    fireEvent.click(option('Progress', /^Completed/))

    expect(screen.getByText('No games match these filters.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Games' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(onViewChange).toHaveBeenLastCalledWith({ ...DEFAULT_VIEW, sort: 'title' })
    expect(titles()).toEqual(['Celeste', 'Hades', 'Ōkami HD', 'Portal'])
    expect(screen.getByText('4 games')).toBeInTheDocument()
  })

  it('hands every change of the view to its parent, so it survives opening a game', async () => {
    await renderLibrary()

    fireEvent.click(option('Platform', /^Steam/))

    expect(onViewChange).toHaveBeenCalledWith({ ...DEFAULT_VIEW, platform: 'steam' })
  })

  it('opens a game when its card is clicked', async () => {
    await renderLibrary()

    fireEvent.click(screen.getByRole('button', { name: /Celeste/ }))

    expect(onOpenGame).toHaveBeenCalledWith(2)
  })

  it('scrolls back to where it was once the games have loaded', async () => {
    listLibrary.mockResolvedValue(GAMES)
    const { scrollParent } = renderScrolled(<Harness restoreScrollTop={640} />)
    expect(scrollParent.scrollTop).toBe(0)

    await screen.findByRole('list', { name: 'Games' })

    expect(scrollParent.scrollTop).toBe(640)
  })

  it('reloads when the main process says the data changed', async () => {
    listLibrary
      .mockResolvedValueOnce([game(1, 'Portal', 0, 0)])
      .mockResolvedValueOnce([game(1, 'Portal', 3, 10)])
    renderScrolled(<Harness />)
    expect(await screen.findByText('Syncing…')).toBeInTheDocument()

    act(() => dataChanged())

    expect(await screen.findByText('30%')).toBeInTheDocument()
  })
})
