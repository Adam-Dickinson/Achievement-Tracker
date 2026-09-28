import { vi } from 'vitest'
import { DEFAULT_NOTIFICATION_SETTINGS, type TrophyLockerApi } from '@shared/ipc'

export function fakeApi(overrides: Partial<TrophyLockerApi> = {}): TrophyLockerApi {
  return {
    getAppInfo: vi.fn().mockResolvedValue({ version: '0.1.0', schemaVersion: 1 }),
    sendTestNotification: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn().mockResolvedValue({ name: null, windowsName: 'adam' }),
    setProfileName: vi.fn((name: string) =>
      Promise.resolve({ name: name.trim() === '' ? null : name.trim(), windowsName: 'adam' }),
    ),
    getOnboardingCompleted: vi.fn().mockResolvedValue(true),
    completeOnboarding: vi.fn().mockResolvedValue(undefined),
    getNotificationsPaused: vi.fn().mockResolvedValue(false),
    setNotificationsPaused: vi.fn().mockResolvedValue(undefined),
    listAccounts: vi.fn().mockResolvedValue([]),
    disconnectAccount: vi.fn().mockResolvedValue(undefined),
    syncNow: vi.fn().mockResolvedValue(undefined),
    connectSteam: vi.fn(),
    connectXbox: vi.fn(),
    cancelXboxSignIn: vi.fn().mockResolvedValue(undefined),
    openEpicSignIn: vi.fn().mockResolvedValue(undefined),
    connectEpic: vi.fn(),
    connectUbisoft: vi.fn(),
    cancelUbisoftSignIn: vi.fn().mockResolvedValue(undefined),
    connectEa: vi.fn(),
    cancelEaSignIn: vi.fn().mockResolvedValue(undefined),
    connectPlayStation: vi.fn(),
    cancelPlayStationSignIn: vi.fn().mockResolvedValue(undefined),
    signInToSteam: vi.fn(),
    cancelSteamSignIn: vi.fn().mockResolvedValue(undefined),
    findShadPs4: vi.fn().mockResolvedValue(null),
    chooseShadPs4Folder: vi.fn().mockResolvedValue({ kind: 'cancelled' }),
    connectShadPs4: vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'other', message: 'not connected in tests' }),
    listLibrary: vi.fn().mockResolvedValue([]),
    getGame: vi.fn().mockResolvedValue(null),
    mergeGames: vi.fn().mockResolvedValue(undefined),
    unlinkGame: vi.fn().mockResolvedValue(undefined),
    openStorePage: vi.fn().mockResolvedValue(undefined),
    getArtworkSettings: vi.fn().mockResolvedValue({ hasKey: false, missing: 0, problem: null }),
    saveSteamGridDbKey: vi.fn(),
    removeSteamGridDbKey: vi.fn().mockResolvedValue(undefined),
    findMissingArtwork: vi.fn().mockResolvedValue({ found: 0, checked: 0 }),
    getDashboard: vi.fn().mockReturnValue(new Promise(() => {})),
    listActivity: vi.fn().mockReturnValue(new Promise(() => {})),
    getNotificationSettings: vi.fn().mockResolvedValue(DEFAULT_NOTIFICATION_SETTINGS),
    updateNotificationSettings: vi.fn().mockResolvedValue(DEFAULT_NOTIFICATION_SETTINGS),
    listDisplays: vi
      .fn()
      .mockResolvedValue([{ id: 1, label: 'Display 1 · Primary', primary: true }]),
    onDataChanged: vi.fn(() => () => {}),
    onToasts: vi.fn(() => () => {}),
    onNotificationsPausedChanged: vi.fn(() => () => {}),
    onNotificationSettingsChanged: vi.fn(() => () => {}),
    ...overrides,
  }
}
