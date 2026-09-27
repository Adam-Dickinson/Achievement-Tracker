import type { LibraryGame, RecentUnlock, UnlockedAchievement } from './library'
import type { Platform } from './platform'
import type { Rarity } from './rarity'

export interface PlatformProgress {
  readonly platform: Platform
  readonly games: number
  readonly unlocked: number
  readonly total: number
}

export interface DayCount {
  readonly date: Date
  readonly count: number
}

export interface RarestUnlock extends UnlockedAchievement {
  readonly coverUrl: string | null
}

export interface DashboardStats {
  readonly unlockedAchievements: number
  readonly totalAchievements: number
  readonly gamesTracked: number
  readonly completedGames: number
  readonly unlockedToday: number
  readonly unlockedThisWeek: number
  readonly streakDays: number
  readonly week: readonly DayCount[]
  readonly unlockedByRarity: Readonly<Record<Rarity, number>>
  readonly platinums: number
  readonly platforms: readonly PlatformProgress[]
  readonly nearlyThere: readonly LibraryGame[]
  readonly recentUnlocks: readonly RecentUnlock[]
  readonly rarestUnlock: RarestUnlock | null
  readonly rarestThisWeek: number | null
}

export function completionPercent(unlocked: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.floor((unlocked * 100) / total))
}
