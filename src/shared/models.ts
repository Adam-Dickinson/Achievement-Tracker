import type { Platform } from './platform'
import type { Secret } from './secret'

export type AccountStatus = 'connected' | 'needs_reauth' | 'error' | 'disabled'

export interface AccountCredentials {
  readonly platform: Platform
  readonly externalId: string
  readonly secret: Secret | null
}

export interface AccountInfo {
  readonly externalId: string
  readonly displayName: string
}

export interface RemoteGameRef {
  readonly externalId: string
}

export interface RemoteGame {
  readonly ref: RemoteGameRef
  readonly title: string
  readonly iconUrl: string | null
  readonly coverUrl: string | null
  readonly lastPlayed: Date | null
  readonly recentlyPlayed: boolean
  readonly storeUrl?: string | null
}

export interface RemoteAchievement {
  readonly externalId: string
  readonly name: string
  readonly description: string | null
  readonly iconUrl: string | null
  readonly iconLockedUrl: string | null
  readonly hidden: boolean
  readonly points: number | null
  readonly tier: string | null
  readonly globalPercent: number | null
}

export interface RemoteUnlock {
  readonly achievementExternalId: string
  readonly unlockedAt: Date | null
  readonly progress: { readonly current: number; readonly max: number } | null
}

export interface RemoteGameAchievements {
  readonly achievements: readonly RemoteAchievement[]
  readonly unlocks: readonly RemoteUnlock[]
}

export interface UnlockEvent {
  readonly platform: Platform
  readonly gameTitle: string
  readonly achievement: RemoteAchievement
  readonly unlockedAt: Date | null
  readonly detectedAt: Date
}
