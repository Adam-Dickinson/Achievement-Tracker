import { describe, expect, it } from 'vitest'
import type { LibraryGame } from '@shared/library'
import {
  applyView,
  averageCompletion,
  clearFilters,
  DEFAULT_VIEW,
  isFiltered,
  platformsIn,
} from './library-view'

function game(id: number, title: string, platforms: LibraryGame['platforms']): LibraryGame {
  return { id, title, platforms, coverUrl: null, unlocked: 0, total: 0, lastUnlockAt: null }
}

describe('isFiltered', () => {
  it('is false for the default view and a search of only spaces', () => {
    expect(isFiltered(DEFAULT_VIEW)).toBe(false)
    expect(isFiltered({ ...DEFAULT_VIEW, query: '   ' })).toBe(false)
  })

  it('is true once a search, platform or progress filter is set, but not for a sort', () => {
    expect(isFiltered({ ...DEFAULT_VIEW, query: 'portal' })).toBe(true)
    expect(isFiltered({ ...DEFAULT_VIEW, platform: 'xbox' })).toBe(true)
    expect(isFiltered({ ...DEFAULT_VIEW, status: 'completed' })).toBe(true)
    expect(isFiltered({ ...DEFAULT_VIEW, sort: 'title' })).toBe(false)
  })
})

describe('platformsIn', () => {
  it('lists each platform in the library once, in the usual platform order', () => {
    const games = [game(1, 'A', ['epic', 'steam']), game(2, 'B', ['playstation', 'steam'])]

    expect(platformsIn(games)).toEqual(['steam', 'playstation', 'epic'])
  })
})

describe('applyView', () => {
  it('leaves the list it was given unchanged', () => {
    const games = [game(1, 'Portal', ['steam']), game(2, 'Celeste', ['steam'])]

    applyView(games, { ...DEFAULT_VIEW, sort: 'title' })

    expect(games.map((g) => g.title)).toEqual(['Portal', 'Celeste'])
  })
})

describe('clearFilters', () => {
  it('drops the search and filters but keeps the sort and the layout', () => {
    const view = {
      query: 'portal',
      platform: 'steam' as const,
      status: 'completed' as const,
      sort: 'title' as const,
      layout: 'list' as const,
    }

    expect(clearFilters(view)).toEqual({ ...DEFAULT_VIEW, sort: 'title', layout: 'list' })
  })
})

describe('averageCompletion', () => {
  const played = (unlocked: number, total: number): LibraryGame => ({
    ...game(1, 'Game', ['steam']),
    unlocked,
    total,
  })

  it("averages each game's completion, rounding down", () => {
    expect(averageCompletion([played(1, 2), played(1, 3), played(3, 3)])).toBe(61)
  })

  it('leaves out games whose achievements are not read yet', () => {
    expect(averageCompletion([played(1, 2), played(0, 0)])).toBe(50)
  })

  it('is 0 without any read game', () => {
    expect(averageCompletion([])).toBe(0)
    expect(averageCompletion([played(0, 0)])).toBe(0)
  })
})
