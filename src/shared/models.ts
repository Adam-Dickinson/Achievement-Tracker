// Normalized data returned by providers. Providers know nothing about SQLite.

import type { Platform } from './platform'
import type { Secret } from './secret'

/** Stored in `account.status`. Only `connected` accounts are synced. */
export type AccountStatus = 'connected' | 'needs_reauth' | 'error' | 'disabled'

/** What a provider needs to talk to the platform for one account. */
export interface AccountCredentials {
  readonly platform: Platform
  /** Platform-side identifier (steamid64, xuid, RA username, ...). */
  readonly externalId: string
  readonly secret: Secret | null
}

export interface AccountInfo {
  readonly externalId: string
  readonly displayName: string
}

/** Identifies a game on a platform (appid, titleId, NPWR id, RA game id, ...). */
export interface RemoteGameRef {
  readonly externalId: string
}

export interface RemoteGame {
  readonly ref: RemoteGameRef
  readonly title: string
  readonly iconUrl: string | null
  readonly lastPlayed: Date | null
  /** Played lately, by the platform's own measure (Steam: its two-week list). Sets how often it is polled. */
  readonly recentlyPlayed: boolean
}

export interface RemoteAchievement {
  readonly externalId: string
  readonly name: string
  readonly description: string | null
  readonly iconUrl: string | null
  readonly iconLockedUrl: string | null
  readonly hidden: boolean
  /** Gamerscore / RA points, when the platform has them. */
  readonly points: number | null
  /** Trophy grade (bronze..platinum), when applicable. */
  readonly tier: string | null
  /** Global unlock percentage 0-100, when known. */
  readonly globalPercent: number | null
}

export interface RemoteUnlock {
  readonly achievementExternalId: string
  /** As reported by the platform; may be absent. */
  readonly unlockedAt: Date | null
  readonly progress: { readonly current: number; readonly max: number } | null
}

/** Full schema plus the account's unlock state for one game. */
export interface RemoteGameAchievements {
  readonly achievements: readonly RemoteAchievement[]
  readonly unlocks: readonly RemoteUnlock[]
}

/** Emitted by the sync engine after a new unlock is committed to the store. */
export interface UnlockEvent {
  readonly platform: Platform
  readonly gameTitle: string
  readonly achievement: RemoteAchievement
  readonly detectedAt: Date
}
