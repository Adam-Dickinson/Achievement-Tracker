import type { Platform } from './platform'

export interface LibraryGame {
  readonly id: number
  readonly title: string
  readonly platforms: readonly Platform[]
  readonly coverUrl: string | null
  readonly unlocked: number
  readonly total: number
  readonly lastUnlockAt: Date | null
}

export interface GameAchievement {
  readonly id: number
  readonly name: string
  readonly description: string | null
  readonly hidden: boolean
  readonly iconUrl: string | null
  readonly iconLockedUrl: string | null
  readonly globalPercent: number | null
  readonly unlocked: boolean
  readonly unlockedAt: Date | null
}

export interface GameEntry {
  readonly platformGameId: number
  readonly platform: Platform
  readonly tag: string | null
  readonly title: string
  readonly unlocked: number
  readonly total: number
  readonly achievements: readonly GameAchievement[]
}

export interface GameDetail {
  readonly game: LibraryGame
  readonly entries: readonly GameEntry[]
}

export interface RecentUnlock {
  readonly achievementId: number
  readonly gameId: number
  readonly platformGameId: number
  readonly gameTitle: string
  readonly platform: Platform
  readonly name: string
  readonly description: string | null
  readonly iconUrl: string | null
  readonly globalPercent: number | null
  readonly unlockedAt: Date
}

export const ACTIVITY_PAGE_SIZE = 50
export const MAX_ACTIVITY_LIMIT = 1000

export interface ActivityPage {
  readonly unlocks: readonly RecentUnlock[]
  readonly hasMore: boolean
}
