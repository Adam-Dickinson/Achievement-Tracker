import { describe, expect, it } from 'vitest'
import type { LibraryGame } from '@shared/library'
import { gameProgress } from './game-progress'

function game(unlocked: number, total: number): LibraryGame {
  return {
    id: 1,
    title: 'Portal',
    platforms: ['steam'],
    coverUrl: null,
    unlocked,
    total,
    lastUnlockAt: null,
  }
}

describe('gameProgress', () => {
  it('reports a game part way through', () => {
    expect(gameProgress(game(34, 42))).toEqual({
      synced: true,
      percent: 80,
      completed: false,
      left: 8,
    })
  })

  it('reports a finished game', () => {
    expect(gameProgress(game(42, 42))).toMatchObject({ percent: 100, completed: true, left: 0 })
  })

  it('reports a game whose achievements are not read yet', () => {
    expect(gameProgress(game(0, 0))).toEqual({
      synced: false,
      percent: 0,
      completed: false,
      left: 0,
    })
  })
})
