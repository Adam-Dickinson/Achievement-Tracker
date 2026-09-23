// The contract between the main process and the UI. Channel names and payload types live here
// so both sides import the same definitions (docs/SPEC.md §6).

import type { AccountStatus } from './models'
import type { Platform } from './platform'
import type { Rarity } from './rarity'

export const IPC = {
  getAppInfo: 'app:get-info',
  sendTestNotification: 'notifications:send-test',
  setToasts: 'overlay:set-toasts',
  listAccounts: 'accounts:list',
  connectSteam: 'accounts:connect-steam',
  accountsChanged: 'accounts:changed',
} as const

export interface AppInfo {
  readonly version: string
  /** Database schema version (SQLite `user_version`). */
  readonly schemaVersion: number
}

/** Everything the overlay needs to draw one unlock toast. */
export interface ToastPayload {
  /** The line above the title, such as "Achievement unlocked" or "7 achievements unlocked". */
  readonly heading: string
  readonly rarity: Rarity
  readonly title: string
  /** Null for hidden achievements, which have none. */
  readonly description: string | null
  readonly game: string
  readonly platform: string
  /** Share of players who have it, when the platform says. */
  readonly percent: number | null
}

/** A toast on screen. The id stays the same while it is shown, so React can animate it. */
export interface VisibleToast extends ToastPayload {
  readonly id: number
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
  /** Called when the account list may have changed (games found, a lost login). Returns an unsubscribe function. */
  onAccountsChanged(listener: () => void): () => void
  /** Subscribe to the toasts on screen, oldest first (used by the overlay window). Returns an unsubscribe function. */
  onToasts(listener: (toasts: readonly VisibleToast[]) => void): () => void
}
