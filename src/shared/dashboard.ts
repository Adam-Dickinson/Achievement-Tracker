import type { LibraryGame, RecentUnlock } from './library'

export interface DashboardStats {
  readonly unlockedAchievements: number
  readonly totalAchievements: number
  readonly gamesTracked: number
  readonly completedGames: number
  readonly unlockedThisWeek: number
  /** Unfinished games closest to 100%, closest first. */
  readonly nearlyThere: readonly LibraryGame[]
  /** Newest first. Only unlocks the platform dated. */
  readonly recentUnlocks: readonly RecentUnlock[]
}

export function completionPercent(unlocked: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.floor((unlocked * 100) / total))
}
