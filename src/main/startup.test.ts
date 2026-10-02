import type { App, LoginItemSettings } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import {
  HIDDEN_ARG,
  launchedHidden,
  setStartWithWindows,
  startupSettings,
  startWithWindows,
} from './startup'

type LoginApp = Pick<App, 'isPackaged' | 'getLoginItemSettings' | 'setLoginItemSettings'>

function fakeApp(isPackaged: boolean, openAtLogin = false): LoginApp {
  return {
    isPackaged,
    getLoginItemSettings: vi.fn(() => ({ openAtLogin }) as LoginItemSettings),
    setLoginItemSettings: vi.fn(),
  }
}

describe('launchedHidden', () => {
  it('is true only when Windows started the app at login', () => {
    expect(launchedHidden(['app.exe', HIDDEN_ARG])).toBe(true)
    expect(launchedHidden(['app.exe'])).toBe(false)
  })
})

describe('startWithWindows', () => {
  it('is not available in development', () => {
    expect(startWithWindows(fakeApp(false))).toBeNull()
  })

  it('reads and sets the login item with the hidden flag, in the installed app', () => {
    const app = fakeApp(true, true)
    const toggle = startWithWindows(app)

    expect(toggle?.get()).toBe(true)
    expect(app.getLoginItemSettings).toHaveBeenCalledWith({ args: [HIDDEN_ARG] })

    toggle?.set(false)
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      args: [HIDDEN_ARG],
    })
  })
})

describe('startupSettings', () => {
  it('is unavailable and off without a toggle', () => {
    expect(startupSettings(null)).toEqual({ available: false, enabled: false })
  })

  it('reports whether the login item is on', () => {
    expect(startupSettings({ get: () => true, set: vi.fn() })).toEqual({
      available: true,
      enabled: true,
    })
  })
})

describe('setStartWithWindows', () => {
  it('sets the toggle and answers with the state read back', () => {
    let on = false
    const toggle = { get: () => on, set: (value: boolean) => void (on = value) }

    expect(setStartWithWindows(toggle, true)).toEqual({ available: true, enabled: true })
  })

  it('answers with the real state when setting fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const toggle = {
      get: () => false,
      set: () => {
        throw new Error('denied')
      },
    }

    expect(setStartWithWindows(toggle, true)).toEqual({ available: true, enabled: false })
  })

  it('does nothing without a toggle', () => {
    expect(setStartWithWindows(null, true)).toEqual({ available: false, enabled: false })
  })
})
