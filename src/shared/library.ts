import type { Platform } from './platform'

/** One game on one platform, as the Library shows it. */
export interface LibraryGame {
  /** The platform_game id: what the Game detail screen is opened with. */
  readonly id: number
  readonly title: string
  readonly platform: Platform
  readonly coverUrl: string | null
  readonly unlocked: number
  /** 0 until the game's first sync has read its achievements. */
  readonly total: number
  readonly lastUnlockAt: Date | null
}

export interface GameAchievement {
  readonly id: number
  readonly name: string
  /** Null for hidden achievements, which have none. */
  readonly description: string | null
  readonly hidden: boolean
  readonly iconUrl: string | null
  readonly iconLockedUrl: string | null
  readonly globalPercent: number | null
  readonly unlocked: boolean
  /** When it was unlocked, if the platform says (null for locked ones). */
  readonly unlockedAt: Date | null
}

export interface GameDetail {
  readonly game: LibraryGame
  readonly achievements: readonly GameAchievement[]
}

/** An unlock as the Dashboard's "Recent unlocks" lists it. */
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
