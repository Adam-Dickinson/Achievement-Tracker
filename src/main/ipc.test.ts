import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardStats } from '@shared/dashboard'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  IPC,
  MAX_PROFILE_NAME,
  type AccountSummary,
  type ConnectResult,
  type DisplayInfo,
  type NotificationSettings,
  type Profile,
} from '@shared/ipc'
import { type ActivityPage, MAX_ACTIVITY_LIMIT } from '@shared/library'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
}))

const { registerIpcHandlers } = await import('./ipc')

const TRUSTED = { senderFrame: { url: 'file:///app/index.html' } }
const UNTRUSTED = { senderFrame: { url: 'https://example.com/' } }
const ACCOUNT: AccountSummary = {
  id: 1,
  platform: 'steam',
  displayName: 'Test',
  status: 'connected',
  gameCount: 0,
  checkedGames: 0,
  unlockedCount: 0,
  lastSyncAt: null,
  syncing: false,
}
const CONNECTED: ConnectResult = { ok: true, account: ACCOUNT }
const DASHBOARD: DashboardStats = {
  unlockedAchievements: 0,
  totalAchievements: 0,
  gamesTracked: 0,
  completedGames: 0,
  unlockedToday: 0,
  unlockedThisWeek: 0,
  streakDays: 0,
  week: [],
  unlockedByRarity: { ultra_rare: 0, rare: 0, uncommon: 0, common: 0 },
  platinums: 0,
  platforms: [],
  nearlyThere: [],
  recentUnlocks: [],
  rarestUnlock: null,
  rarestThisWeek: null,
}

const PROFILE: Profile = { name: null, windowsName: 'tester' }

const ACTIVITY: ActivityPage = { unlocks: [], hasMore: true }

const DISPLAYS: DisplayInfo[] = [{ id: 1, label: 'Display 1 · Primary', primary: true }]

const fakes = {
  getAppInfo: vi.fn(() => ({ version: '0.1.0', schemaVersion: 2 })),
  sendTestNotification: vi.fn(() => Promise.resolve()),
  getProfile: vi.fn(() => PROFILE),
  setProfileName: vi.fn((name: string | null) => ({ ...PROFILE, name })),
  getNotificationsPaused: vi.fn(() => true),
  setNotificationsPaused: vi.fn(),
  listAccounts: vi.fn(() => [ACCOUNT]),
  disconnectAccount: vi.fn(),
  syncNow: vi.fn(() => Promise.resolve()),
  connectSteam: vi.fn(() => Promise.resolve(CONNECTED)),
  connectXbox: vi.fn(() => Promise.resolve(CONNECTED)),
  cancelXboxSignIn: vi.fn(),
  openEpicSignIn: vi.fn(() => Promise.resolve()),
  connectEpic: vi.fn(() => Promise.resolve(CONNECTED)),
  connectUbisoft: vi.fn(() => Promise.resolve(CONNECTED)),
  cancelUbisoftSignIn: vi.fn(),
  connectEa: vi.fn(() => Promise.resolve(CONNECTED)),
  cancelEaSignIn: vi.fn(),
  connectPlayStation: vi.fn(() => Promise.resolve(CONNECTED)),
  cancelPlayStationSignIn: vi.fn(),
  signInToSteam: vi.fn(() => Promise.resolve(CONNECTED)),
  cancelSteamSignIn: vi.fn(),
  listLibrary: vi.fn(() => []),
  getGame: vi.fn(() => null),
  mergeGames: vi.fn(),
  unlinkGame: vi.fn(),
  openStorePage: vi.fn(() => Promise.resolve()),
  getArtworkSettings: vi.fn(() => ({ hasKey: false, missing: 3, problem: null })),
  saveSteamGridDbKey: vi.fn(() => Promise.resolve({ ok: true as const })),
  removeSteamGridDbKey: vi.fn(),
  findMissingArtwork: vi.fn(() => Promise.resolve({ found: 2, checked: 3 })),
  getDashboard: vi.fn(() => DASHBOARD),
  listActivity: vi.fn(() => ACTIVITY),
  getNotificationSettings: vi.fn(() => DEFAULT_NOTIFICATION_SETTINGS),
  updateNotificationSettings: vi.fn(
    (patch: Partial<NotificationSettings>): NotificationSettings => ({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...patch,
    }),
  ),
  listDisplays: vi.fn(() => DISPLAYS),
}

function call(channel: string, event: unknown, ...args: unknown[]): unknown {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`nothing registered for ${channel}`)
  return handler(event, ...args)
}

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => {
  handlers.clear()
  vi.clearAllMocks()
  registerIpcHandlers(fakes)
})

describe('registerIpcHandlers', () => {
  it('lists accounts for our own pages', () => {
    expect(call(IPC.listAccounts, TRUSTED)).toEqual([ACCOUNT])
  })

  it.each([
    IPC.getAppInfo,
    IPC.sendTestNotification,
    IPC.getProfile,
    IPC.setProfileName,
    IPC.getNotificationsPaused,
    IPC.setNotificationsPaused,
    IPC.listAccounts,
    IPC.disconnectAccount,
    IPC.syncNow,
    IPC.connectSteam,
    IPC.connectXbox,
    IPC.cancelXboxSignIn,
    IPC.openEpicSignIn,
    IPC.connectEpic,
    IPC.connectUbisoft,
    IPC.cancelUbisoftSignIn,
    IPC.connectEa,
    IPC.cancelEaSignIn,
    IPC.connectPlayStation,
    IPC.cancelPlayStationSignIn,
    IPC.signInToSteam,
    IPC.cancelSteamSignIn,
    IPC.listLibrary,
    IPC.getGame,
    IPC.mergeGames,
    IPC.unlinkGame,
    IPC.openStorePage,
    IPC.getArtworkSettings,
    IPC.saveSteamGridDbKey,
    IPC.removeSteamGridDbKey,
    IPC.findMissingArtwork,
    IPC.getDashboard,
    IPC.listActivity,
    IPC.getNotificationSettings,
    IPC.updateNotificationSettings,
    IPC.listDisplays,
  ])('refuses %s from a page we did not ship', (channel) => {
    expect(() => call(channel, UNTRUSTED, { steamId: 'x', apiKey: 'y' })).toThrow(
      'Untrusted sender',
    )
  })

  it('passes a valid Steam connect request on, trimmed', async () => {
    const result = await call(IPC.connectSteam, TRUSTED, {
      steamId: ' 76561190000000001 ',
      apiKey: ' KEY ',
    })

    expect(result).toEqual(CONNECTED)
    expect(fakes.connectSteam).toHaveBeenCalledWith({
      steamId: '76561190000000001',
      apiKey: 'KEY',
    })
  })

  it.each([
    ['nothing', undefined, 'Enter both your SteamID and your Steam API key.'],
    ['a string', 'steam', 'Enter both your SteamID and your Steam API key.'],
    ['a missing key', { steamId: '76561190000000001' }, 'Enter your Steam API key.'],
    ['an empty SteamID', { steamId: '   ', apiKey: 'KEY' }, 'Enter your SteamID.'],
    [
      'a number for the key',
      { steamId: '76561190000000001', apiKey: 42 },
      'Enter your Steam API key.',
    ],
    [
      'an absurdly long key',
      { steamId: '76561190000000001', apiKey: 'K'.repeat(101) },
      'That key is too long: it should be 32 letters and digits.',
    ],
    [
      'an absurdly long SteamID',
      { steamId: '7'.repeat(101), apiKey: 'KEY' },
      'That SteamID is too long: it should be 17 digits.',
    ],
  ])(
    'answers %s with invalid_input, without trying to connect',
    async (_label, payload, message) => {
      const result = await call(IPC.connectSteam, TRUSTED, payload)

      expect(result).toEqual({ ok: false, reason: 'invalid_input', message })
      expect(fakes.connectSteam).not.toHaveBeenCalled()
    },
  )

  it('logs which rule failed, but never what was typed', async () => {
    await call(IPC.connectSteam, TRUSTED, { steamId: 'SECRET-ID', apiKey: 'K'.repeat(101) })

    expect(warn).toHaveBeenCalledOnce()
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('apiKey: too_big')
    expect(logged).not.toContain('SECRET-ID')
    expect(logged).not.toContain('KKKK')
  })
})

describe('Xbox handlers', () => {
  it('connects once the unofficial connection has been accepted', async () => {
    const result = await call(IPC.connectXbox, TRUSTED, { acceptedUnofficial: true })

    expect(result).toEqual(CONNECTED)
    expect(fakes.connectXbox).toHaveBeenCalledWith({ acceptedUnofficial: true })
  })

  it.each([
    ['nothing', undefined],
    ['a refusal', { acceptedUnofficial: false }],
    ['a truthy string', { acceptedUnofficial: 'yes' }],
  ])('answers %s with invalid_input, without starting a sign-in', async (_label, payload) => {
    const result = await call(IPC.connectXbox, TRUSTED, payload)

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_input',
      message: 'Confirm that you understand the Xbox connection is unofficial.',
    })
    expect(fakes.connectXbox).not.toHaveBeenCalled()
  })

  it('cancels a sign-in that is waiting', () => {
    call(IPC.cancelXboxSignIn, TRUSTED)

    expect(fakes.cancelXboxSignIn).toHaveBeenCalledOnce()
  })
})

describe('Ubisoft handlers', () => {
  it('connects once the unofficial connection has been accepted', async () => {
    const result = await call(IPC.connectUbisoft, TRUSTED, { acceptedUnofficial: true })

    expect(result).toEqual(CONNECTED)
    expect(fakes.connectUbisoft).toHaveBeenCalledWith({ acceptedUnofficial: true })
  })

  it.each([
    ['nothing', undefined],
    ['a refusal', { acceptedUnofficial: false }],
    ['a truthy string', { acceptedUnofficial: 'yes' }],
  ])(
    'answers %s with invalid_input, without opening the sign-in window',
    async (_label, payload) => {
      const result = await call(IPC.connectUbisoft, TRUSTED, payload)

      expect(result).toEqual({
        ok: false,
        reason: 'invalid_input',
        message: 'Confirm that you understand the Ubisoft connection is unofficial.',
      })
      expect(fakes.connectUbisoft).not.toHaveBeenCalled()
    },
  )

  it('cancels a sign-in that is waiting', () => {
    call(IPC.cancelUbisoftSignIn, TRUSTED)

    expect(fakes.cancelUbisoftSignIn).toHaveBeenCalledOnce()
  })
})

describe('EA handlers', () => {
  it('connects once the unofficial connection has been accepted', async () => {
    const result = await call(IPC.connectEa, TRUSTED, { acceptedUnofficial: true })

    expect(result).toEqual(CONNECTED)
    expect(fakes.connectEa).toHaveBeenCalledWith({ acceptedUnofficial: true })
  })

  it.each([
    ['nothing', undefined],
    ['a refusal', { acceptedUnofficial: false }],
    ['a truthy string', { acceptedUnofficial: 'yes' }],
  ])(
    'answers %s with invalid_input, without opening the sign-in window',
    async (_label, payload) => {
      const result = await call(IPC.connectEa, TRUSTED, payload)

      expect(result).toEqual({
        ok: false,
        reason: 'invalid_input',
        message: 'Confirm that you understand the EA connection is unofficial.',
      })
      expect(fakes.connectEa).not.toHaveBeenCalled()
    },
  )

  it('cancels a sign-in that is waiting', () => {
    call(IPC.cancelEaSignIn, TRUSTED)

    expect(fakes.cancelEaSignIn).toHaveBeenCalledOnce()
  })
})

describe('PlayStation handlers', () => {
  it('connects once the unofficial connection has been accepted', async () => {
    const result = await call(IPC.connectPlayStation, TRUSTED, { acceptedUnofficial: true })

    expect(result).toEqual(CONNECTED)
    expect(fakes.connectPlayStation).toHaveBeenCalledWith({ acceptedUnofficial: true })
  })

  it.each([
    ['nothing', undefined],
    ['a refusal', { acceptedUnofficial: false }],
  ])(
    'answers %s with invalid_input, without opening the sign-in window',
    async (_label, payload) => {
      const result = await call(IPC.connectPlayStation, TRUSTED, payload)

      expect(result).toEqual({
        ok: false,
        reason: 'invalid_input',
        message: 'Confirm that you understand the PlayStation connection is unofficial.',
      })
      expect(fakes.connectPlayStation).not.toHaveBeenCalled()
    },
  )

  it('cancels a sign-in that is waiting', () => {
    call(IPC.cancelPlayStationSignIn, TRUSTED)

    expect(fakes.cancelPlayStationSignIn).toHaveBeenCalledOnce()
  })
})

describe('Steam sign-in handlers', () => {
  it.each([true, false])(
    'signs in once the unofficial connection has been accepted (family library: %s)',
    async (includeFamily) => {
      const input = { includeFamily, acceptedUnofficial: true }

      expect(await call(IPC.signInToSteam, TRUSTED, input)).toEqual(CONNECTED)
      expect(fakes.signInToSteam).toHaveBeenCalledWith(input)
    },
  )

  it.each([
    ['nothing', undefined],
    ['a refusal', { includeFamily: true, acceptedUnofficial: false }],
    ['no family choice', { acceptedUnofficial: true }],
    ['a truthy string', { includeFamily: 'yes', acceptedUnofficial: true }],
  ])(
    'answers %s with invalid_input, without opening the sign-in window',
    async (_label, payload) => {
      const result = await call(IPC.signInToSteam, TRUSTED, payload)

      expect(result).toEqual({
        ok: false,
        reason: 'invalid_input',
        message: 'Confirm that you understand signing in to Steam here is unofficial.',
      })
      expect(fakes.signInToSteam).not.toHaveBeenCalled()
    },
  )

  it('cancels a sign-in that is waiting', () => {
    call(IPC.cancelSteamSignIn, TRUSTED)

    expect(fakes.cancelSteamSignIn).toHaveBeenCalledOnce()
  })
})

describe('Epic handlers', () => {
  const CODE = '0123456789abcdef0123456789abcdef'

  it('opens the Epic sign-in page', async () => {
    await call(IPC.openEpicSignIn, TRUSTED)

    expect(fakes.openEpicSignIn).toHaveBeenCalledOnce()
  })

  it('connects with the pasted text, trimmed, once the unofficial connection is accepted', async () => {
    const result = await call(IPC.connectEpic, TRUSTED, {
      code: `  ${CODE}\n`,
      acceptedUnofficial: true,
    })

    expect(result).toEqual(CONNECTED)
    expect(fakes.connectEpic).toHaveBeenCalledWith({ code: CODE, acceptedUnofficial: true })
  })

  it.each([
    ['nothing', undefined, 'Confirm that you understand the Epic connection is unofficial.'],
    [
      'no opt-in',
      { code: CODE, acceptedUnofficial: false },
      'Confirm that you understand the Epic connection is unofficial.',
    ],
    [
      'an empty code',
      { code: '   ', acceptedUnofficial: true },
      "Paste the code from Epic's page.",
    ],
    [
      'a number for the code',
      { code: 42, acceptedUnofficial: true },
      "Paste the code from Epic's page.",
    ],
    [
      'an absurdly long paste',
      { code: 'x'.repeat(2001), acceptedUnofficial: true },
      "That's too long to be Epic's code. Copy just the Epic page and paste it here.",
    ],
  ])(
    'answers %s with invalid_input, without trying to connect',
    async (_label, payload, message) => {
      const result = await call(IPC.connectEpic, TRUSTED, payload)

      expect(result).toEqual({ ok: false, reason: 'invalid_input', message })
      expect(fakes.connectEpic).not.toHaveBeenCalled()
    },
  )
})

describe('library and dashboard handlers', () => {
  it('lists the library and returns the dashboard for our own pages', () => {
    expect(call(IPC.listLibrary, TRUSTED)).toEqual([])
    expect(call(IPC.getDashboard, TRUSTED)).toEqual(DASHBOARD)
  })

  it('passes a valid game id on', () => {
    call(IPC.getGame, TRUSTED, 42)

    expect(fakes.getGame).toHaveBeenCalledWith(42)
  })

  it.each([
    ['nothing', undefined],
    ['a string', '42'],
    ['zero', 0],
    ['a negative id', -1],
    ['a fraction', 1.5],
  ])('answers %s as a game id with null, without looking it up', (_label, id) => {
    expect(call(IPC.getGame, TRUSTED, id)).toBeNull()
    expect(fakes.getGame).not.toHaveBeenCalled()
  })
})

describe('activity handler', () => {
  it('passes a valid limit on and returns the page', () => {
    expect(call(IPC.listActivity, TRUSTED, 50)).toEqual(ACTIVITY)
    expect(fakes.listActivity).toHaveBeenCalledWith(50)
  })

  it('accepts the largest limit', () => {
    call(IPC.listActivity, TRUSTED, MAX_ACTIVITY_LIMIT)

    expect(fakes.listActivity).toHaveBeenCalledWith(MAX_ACTIVITY_LIMIT)
  })

  it.each([
    ['nothing', undefined],
    ['a string', '50'],
    ['zero', 0],
    ['a fraction', 2.5],
    ['more than the largest limit', MAX_ACTIVITY_LIMIT + 1],
  ])('answers %s as a limit with an empty page, without a query', (_label, limit) => {
    expect(call(IPC.listActivity, TRUSTED, limit)).toEqual({ unlocks: [], hasMore: false })
    expect(fakes.listActivity).not.toHaveBeenCalled()
  })
})

describe('account and sync handlers', () => {
  it.each([true, false])('disconnects an account, keeping its data: %s', (keepData) => {
    call(IPC.disconnectAccount, TRUSTED, { accountId: 4, keepData })

    expect(fakes.disconnectAccount).toHaveBeenCalledWith({ accountId: 4, keepData })
  })

  it.each([
    ['nothing', undefined],
    ['no choice about the data', { accountId: 4 }],
    ['the choice as text', { accountId: 4, keepData: 'yes' }],
    ['a zero id', { accountId: 0, keepData: true }],
    ['an id as text', { accountId: '4', keepData: true }],
  ])('ignores a disconnect with %s', (_label, payload) => {
    call(IPC.disconnectAccount, TRUSTED, payload)

    expect(fakes.disconnectAccount).not.toHaveBeenCalled()
  })

  it.each([[{ kind: 'all' }], [{ kind: 'account', accountId: 2 }], [{ kind: 'game', gameId: 9 }]])(
    'passes a sync of %o on',
    async (scope) => {
      await call(IPC.syncNow, TRUSTED, scope)

      expect(fakes.syncNow).toHaveBeenCalledWith(scope)
    },
  )

  it.each([
    ['nothing', undefined],
    ['an unknown kind', { kind: 'everything' }],
    ['an account without an id', { kind: 'account' }],
    ['a game id as text', { kind: 'game', gameId: '9' }],
    ['a negative account id', { kind: 'account', accountId: -2 }],
  ])('ignores a sync with %s', async (_label, payload) => {
    await call(IPC.syncNow, TRUSTED, payload)

    expect(fakes.syncNow).not.toHaveBeenCalled()
  })
})

describe('profile handlers', () => {
  it('returns the profile', () => {
    expect(call(IPC.getProfile, TRUSTED)).toEqual(PROFILE)
  })

  it('saves a trimmed name and returns the new profile', () => {
    expect(call(IPC.setProfileName, TRUSTED, '  Adam ')).toEqual({ ...PROFILE, name: 'Adam' })
    expect(fakes.setProfileName).toHaveBeenCalledExactlyOnceWith('Adam')
  })

  it.each(['', '   '])('clears the name when given %j', (name) => {
    call(IPC.setProfileName, TRUSTED, name)

    expect(fakes.setProfileName).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('accepts the longest name', () => {
    call(IPC.setProfileName, TRUSTED, 'a'.repeat(MAX_PROFILE_NAME))

    expect(fakes.setProfileName).toHaveBeenCalledExactlyOnceWith('a'.repeat(MAX_PROFILE_NAME))
  })

  it.each([
    ['nothing', undefined],
    ['a number', 42],
    ['a name too long', 'a'.repeat(MAX_PROFILE_NAME + 1)],
  ])('ignores %s and returns the profile unchanged', (_label, name) => {
    expect(call(IPC.setProfileName, TRUSTED, name)).toEqual(PROFILE)
    expect(fakes.setProfileName).not.toHaveBeenCalled()
  })
})

describe('notification pause handlers', () => {
  it('reports whether notifications are paused', () => {
    expect(call(IPC.getNotificationsPaused, TRUSTED)).toBe(true)
  })

  it.each([true, false])('pauses or resumes notifications: %s', (paused) => {
    call(IPC.setNotificationsPaused, TRUSTED, paused)

    expect(fakes.setNotificationsPaused).toHaveBeenCalledExactlyOnceWith(paused)
  })

  it.each([
    ['nothing', undefined],
    ['text', 'true'],
    ['a number', 1],
    ['an object', { paused: true }],
  ])('ignores a pause request with %s', (_label, payload) => {
    call(IPC.setNotificationsPaused, TRUSTED, payload)

    expect(fakes.setNotificationsPaused).not.toHaveBeenCalled()
  })
})

describe('game linking handlers', () => {
  it('merges one game into another', () => {
    call(IPC.mergeGames, TRUSTED, { intoGameId: 1, gameId: 2 })

    expect(fakes.mergeGames).toHaveBeenCalledWith({ intoGameId: 1, gameId: 2 })
  })

  it.each([
    ['nothing', undefined],
    ['the same game twice', { intoGameId: 3, gameId: 3 }],
    ['a missing id', { intoGameId: 1 }],
    ['a fractional id', { intoGameId: 1.5, gameId: 2 }],
    ['a negative id', { intoGameId: -1, gameId: 2 }],
    ['ids as text', { intoGameId: '1', gameId: '2' }],
  ])('ignores a merge with %s', (_label, payload) => {
    call(IPC.mergeGames, TRUSTED, payload)

    expect(fakes.mergeGames).not.toHaveBeenCalled()
  })

  it('unlinks one platform entry', () => {
    call(IPC.unlinkGame, TRUSTED, { platformGameId: 7 })

    expect(fakes.unlinkGame).toHaveBeenCalledWith({ platformGameId: 7 })
  })

  it.each([
    ['nothing', undefined],
    ['zero', { platformGameId: 0 }],
    ['text', { platformGameId: '7' }],
  ])('ignores an unlink with %s', (_label, payload) => {
    call(IPC.unlinkGame, TRUSTED, payload)

    expect(fakes.unlinkGame).not.toHaveBeenCalled()
  })
})

describe('store page handler', () => {
  it('opens the store page of a platform game', async () => {
    await call(IPC.openStorePage, TRUSTED, 70)

    expect(fakes.openStorePage).toHaveBeenCalledExactlyOnceWith(70)
  })

  it.each([
    ['nothing', undefined],
    ['a zero id', 0],
    ['an id as text', '70'],
    ['a URL', 'steam://run/620'],
  ])('ignores %s', async (_label, payload) => {
    await call(IPC.openStorePage, TRUSTED, payload)

    expect(fakes.openStorePage).not.toHaveBeenCalled()
  })
})

describe('artwork handlers', () => {
  it('reports the artwork settings and runs a search for missing artwork', async () => {
    expect(call(IPC.getArtworkSettings, TRUSTED)).toEqual({
      hasKey: false,
      missing: 3,
      problem: null,
    })
    expect(await call(IPC.findMissingArtwork, TRUSTED)).toEqual({ found: 2, checked: 3 })
  })

  it('saves a trimmed SteamGridDB key', async () => {
    const result = await call(IPC.saveSteamGridDbKey, TRUSTED, {
      key: ' 0123456789abcdef0123456789abcdef ',
    })

    expect(result).toEqual({ ok: true })
    expect(fakes.saveSteamGridDbKey).toHaveBeenCalledWith({
      key: '0123456789abcdef0123456789abcdef',
    })
  })

  it.each([
    ['nothing', undefined],
    ['an empty key', { key: '' }],
    ['a key with spaces inside', { key: '0123456789abcdef 0123456789abcdef' }],
    ['a key that is too short', { key: 'abc123' }],
    ['a number', { key: 1234567890123456 }],
  ])('refuses %s without asking SteamGridDB', async (_label, payload) => {
    expect(await call(IPC.saveSteamGridDbKey, TRUSTED, payload)).toMatchObject({
      ok: false,
      reason: 'invalid_input',
    })
    expect(fakes.saveSteamGridDbKey).not.toHaveBeenCalled()
  })

  it('removes the key', () => {
    call(IPC.removeSteamGridDbKey, TRUSTED)

    expect(fakes.removeSteamGridDbKey).toHaveBeenCalledOnce()
  })
})

describe('notification settings handlers', () => {
  it('reports the current settings', () => {
    expect(call(IPC.getNotificationSettings, TRUSTED)).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
  })

  it('lists the displays', () => {
    expect(call(IPC.listDisplays, TRUSTED)).toEqual(DISPLAYS)
  })

  it('passes a valid patch straight through', () => {
    const result = call(IPC.updateNotificationSettings, TRUSTED, {
      corner: 'top-left',
      durationSec: 8,
    })

    expect(result).toEqual({ ...DEFAULT_NOTIFICATION_SETTINGS, corner: 'top-left', durationSec: 8 })
    expect(fakes.updateNotificationSettings).toHaveBeenCalledWith({
      corner: 'top-left',
      durationSec: 8,
    })
  })

  it('passes through a single platform toggle without the others', () => {
    call(IPC.updateNotificationSettings, TRUSTED, { enabledPlatforms: { xbox: false } })

    expect(fakes.updateNotificationSettings).toHaveBeenCalledWith({
      enabledPlatforms: { xbox: false },
    })
  })

  it.each([
    ['an unknown corner', { corner: 'somewhere' }],
    ['a duration out of range', { durationSec: 999 }],
    ['a volume out of range', { sound: { volume: 4 } }],
    ['an unknown platform key', { enabledPlatforms: { switch: true } }],
  ])('ignores a patch with %s', (_label, payload) => {
    call(IPC.updateNotificationSettings, TRUSTED, payload)

    expect(fakes.updateNotificationSettings).toHaveBeenCalledWith({})
  })
})
