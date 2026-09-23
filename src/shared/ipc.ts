// The contract between the main process and the UI. Channel names and payload types live here
// so both sides import the same definitions (docs/SPEC.md §6).

import type { AccountStatus } from './models'
import type { Platform } from './platform'
import type { Rarity } from './rarity'

export const IPC = {
  getAppInfo: 'app:get-info',
  sendTestNotification: 'notifications:send-test',
  showToast: 'overlay:show-toast',
  listAccounts: 'accounts:list',
  connectSteam: 'accounts:connect-steam',
} as const

export interface AppInfo {
  readonly version: string
  /** Database schema version (SQLite `user_version`). */
  readonly schemaVersion: number
}

/** Everything the overlay needs to draw one unlock toast. */
export interface ToastPayload {
  readonly rarity: Rarity
  readonly title: string
  readonly description: string
  readonly game: string
  readonly platform: string
  readonly percent: number
  /** How long the toast stays on screen. */
  readonly durationMs: number
}

/** One connected account, as the Accounts screen shows it. Never carries the key. */
export interface AccountSummary {
  readonly id: number
  readonly platform: Platform
  readonly displayName: string
  readonly status: AccountStatus
  readonly gameCount: number
}

/** What the Steam connect form sends. The key crosses as a plain string once, UI to main. */
export interface SteamConnectInput {
  readonly steamId: string
  readonly apiKey: string
}

export type ConnectFailure = 'invalid_input' | 'key_rejected' | 'network' | 'other'

// A result rather than a thrown error: across IPC an error keeps only its message text.
export type ConnectResult =
  | { readonly ok: true; readonly account: AccountSummary }
  | { readonly ok: false; readonly reason: ConnectFailure; readonly message: string }

/** What the preload script exposes to the UI as `window.api`. */
export interface AchievementTrackerApi {
  getAppInfo(): Promise<AppInfo>
  sendTestNotification(): Promise<void>
  listAccounts(): Promise<AccountSummary[]>
  connectSteam(input: SteamConnectInput): Promise<ConnectResult>
  /** Subscribe to toasts (used by the overlay window). Returns an unsubscribe function. */
  onToast(listener: (toast: ToastPayload) => void): () => void
}
