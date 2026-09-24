import type { Platform } from './platform'

export interface LibraryGame {
  readonly id: number
  readonly title: string
  readonly platform: Platform
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

export interface GameDetail {
  readonly game: LibraryGame
  readonly achievements: readonly GameAchievement[]
}

export interface RecentUnlock {
  readonly achievementId: number
  readonly gameId: number
  readonly gameTitle: string
  readonly platform: Platform
  readonly name: string
  readonly iconUrl: string | null
  readonly globalPercent: number | null
  readonly unlockedAt: Date
}
