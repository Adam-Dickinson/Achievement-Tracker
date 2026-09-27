import { completionPercent } from '@shared/dashboard'
import type { LibraryGame } from '@shared/library'

export interface GameProgress {
  readonly synced: boolean
  readonly percent: number
  readonly completed: boolean
  readonly left: number
}

export function gameProgress(game: LibraryGame): GameProgress {
  const synced = game.total > 0
  return {
    synced,
    percent: synced ? completionPercent(game.unlocked, game.total) : 0,
    completed: synced && game.unlocked === game.total,
    left: Math.max(0, game.total - game.unlocked),
  }
}
