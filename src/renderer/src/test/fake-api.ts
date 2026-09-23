import { vi } from 'vitest'
import type { AchievementTrackerApi } from '@shared/ipc'

/**
 * A stand-in for the preload's `window.api` in component tests: every call is a `vi.fn()` that
 * does nothing, and subscriptions return a no-op unsubscribe. Pass what a test cares about.
 */
export function fakeApi(overrides: Partial<AchievementTrackerApi> = {}): AchievementTrackerApi {
  return {
    getAppInfo: vi.fn().mockResolvedValue({ version: '0.1.0', schemaVersion: 1 }),
    sendTestNotification: vi.fn().mockResolvedValue(undefined),
    listAccounts: vi.fn().mockResolvedValue([]),
    connectSteam: vi.fn(),
    listLibrary: vi.fn().mockResolvedValue([]),
    getGame: vi.fn().mockResolvedValue(null),
    getDashboard: vi.fn().mockReturnValue(new Promise(() => {})),
    onDataChanged: vi.fn(() => () => {}),
    onToasts: vi.fn(() => () => {}),
    ...overrides,
  }
}
