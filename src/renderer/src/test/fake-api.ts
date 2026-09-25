import { vi } from 'vitest'
import type { TrophyLockerApi } from '@shared/ipc'

export function fakeApi(overrides: Partial<TrophyLockerApi> = {}): TrophyLockerApi {
  return {
    getAppInfo: vi.fn().mockResolvedValue({ version: '0.1.0', schemaVersion: 1 }),
    sendTestNotification: vi.fn().mockResolvedValue(undefined),
    listAccounts: vi.fn().mockResolvedValue([]),
    connectSteam: vi.fn(),
    connectXbox: vi.fn(),
    cancelXboxSignIn: vi.fn().mockResolvedValue(undefined),
    openEpicSignIn: vi.fn().mockResolvedValue(undefined),
    connectEpic: vi.fn(),
    connectUbisoft: vi.fn(),
    cancelUbisoftSignIn: vi.fn().mockResolvedValue(undefined),
    connectEa: vi.fn(),
    cancelEaSignIn: vi.fn().mockResolvedValue(undefined),
    connectSteamFamily: vi.fn(),
    cancelSteamFamilySignIn: vi.fn().mockResolvedValue(undefined),
    listLibrary: vi.fn().mockResolvedValue([]),
    getGame: vi.fn().mockResolvedValue(null),
    getDashboard: vi.fn().mockReturnValue(new Promise(() => {})),
    listActivity: vi.fn().mockReturnValue(new Promise(() => {})),
    onDataChanged: vi.fn(() => () => {}),
    onToasts: vi.fn(() => () => {}),
    ...overrides,
  }
}
