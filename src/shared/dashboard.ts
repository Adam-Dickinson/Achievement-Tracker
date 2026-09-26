import type { LibraryGame, RecentUnlock, UnlockedAchievement } from './library'
import type { Platform } from './platform'

export interface PlatformProgress {
  readonly platform: Platform
  readonly games: number
  readonly unlocked: number
  readonly total: number
}

export interface DashboardStats {
  readonly unlockedAchievements: number
  readonly totalAchievements: number
  readonly gamesTracked: number
  readonly completedGames: number
  readonly unlockedThisWeek: number
  readonly platforms: readonly PlatformProgress[]
  readonly nearlyThere: readonly LibraryGame[]
  readonly recentUnlocks: readonly RecentUnlock[]
  readonly rarestUnlocks: readonly UnlockedAchievement[]
}

export function completionPercent(unlocked: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.floor((unlocked * 100) / total))
}
