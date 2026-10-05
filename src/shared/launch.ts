import type { Platform } from './platform'

export interface InstalledEntry {
  readonly gameId: number
  readonly platformGameId: number
  readonly platform: Platform
}

export type PlayResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export interface KnownGame {
  readonly id: number
  readonly gameId: number
  readonly platform: Platform
  readonly externalId: string
  readonly title: string
}

export type EmulatorId = 'rpcs3'

export interface EmulatorProgram {
  readonly emulator: EmulatorId
  readonly path: string | null
  readonly source: 'chosen' | 'found' | null
}
