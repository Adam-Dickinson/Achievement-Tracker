import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, type AccountSummary, type ConnectResult } from '@shared/ipc'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

// ipcMain only exists inside a running Electron app: record what gets registered instead.
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
}
const CONNECTED: ConnectResult = { ok: true, account: ACCOUNT }

const fakes = {
  getAppInfo: vi.fn(() => ({ version: '0.1.0', schemaVersion: 2 })),
  sendTestNotification: vi.fn(() => Promise.resolve()),
  listAccounts: vi.fn(() => [ACCOUNT]),
  connectSteam: vi.fn(() => Promise.resolve(CONNECTED)),
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

  it.each([IPC.getAppInfo, IPC.sendTestNotification, IPC.listAccounts, IPC.connectSteam])(
    'refuses %s from a page we did not ship',
    (channel) => {
      expect(() => call(channel, UNTRUSTED, { steamId: 'x', apiKey: 'y' })).toThrow(
        'Untrusted sender',
      )
    },
  )

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
