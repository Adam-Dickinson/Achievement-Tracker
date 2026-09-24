import type { App, LoginItemSettings } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { HIDDEN_ARG, launchedHidden, startWithWindows } from './startup'

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
