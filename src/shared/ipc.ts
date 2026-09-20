// The contract between the main process and the UI. Channel names and payload types live here
// so both sides import the same definitions (docs/SPEC.md §6).

import type { Rarity } from './rarity'

export const IPC = {
  getAppInfo: 'app:get-info',
  sendTestNotification: 'notifications:send-test',
  showToast: 'overlay:show-toast',
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

/** What the preload script exposes to the UI as `window.api`. */
export interface AchievementTrackerApi {
  getAppInfo(): Promise<AppInfo>
  sendTestNotification(): Promise<void>
  /** Subscribe to toasts (used by the overlay window). Returns an unsubscribe function. */
  onToast(listener: (toast: ToastPayload) => void): () => void
}
