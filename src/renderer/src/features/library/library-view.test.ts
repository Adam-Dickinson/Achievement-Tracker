import { describe, expect, it } from 'vitest'
import type { LibraryGame } from '@shared/library'
import { applyView, DEFAULT_VIEW, isFiltered, platformsIn } from './library-view'

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
