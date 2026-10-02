import type { Platform } from './platform'

export const DATA_EXPORT_FORMAT = 1

export interface ExportedUnlock {
  readonly unlockedAt: string | null
  readonly detectedAt: string
  readonly progressCurrent: number | null
  readonly progressMax: number | null
}

export interface ExportedAchievement {
  readonly id: number
  readonly name: string
  readonly description: string | null
  readonly iconUrl: string | null
  readonly iconLockedUrl: string | null
  readonly hidden: boolean
  readonly points: number | null
  readonly tier: string | null
  readonly globalPercent: number | null
  readonly unlock: ExportedUnlock | null
}

export interface ExportedPlatinum {
  readonly earnedAt: string | null
  readonly detectedAt: string
}

export interface ExportedEntry {
  readonly id: number
  readonly accountId: number
  readonly platform: Platform
  readonly title: string
  readonly iconUrl: string | null
  readonly coverUrl: string | null
  readonly portraitUrl: string | null
  readonly heroUrl: string | null
  readonly storeUrl: string | null
  readonly lastPlayed: string | null
  readonly linked: string
  readonly platinum: ExportedPlatinum | null
  readonly achievements: readonly ExportedAchievement[]
}

export interface ExportedGame {
  readonly id: number
  readonly title: string
  readonly releaseYear: number | null
  readonly coverUrl: string | null
  readonly entries: readonly ExportedEntry[]
}

export interface ExportedAccount {
  readonly id: number
  readonly platform: Platform
  readonly displayName: string
  readonly status: string
  readonly lastSyncAt: string | null
  readonly createdAt: string
}

export interface ExportedAlias {
  readonly matchKey: string
  readonly gameId: number
}

export interface DataExport {
  readonly format: typeof DATA_EXPORT_FORMAT
  readonly exportedAt: string
  readonly app: { readonly version: string; readonly schemaVersion: number }
  readonly accounts: readonly ExportedAccount[]
  readonly games: readonly ExportedGame[]
  readonly aliases: readonly ExportedAlias[]
  readonly settings: Readonly<Record<string, unknown>>
}
