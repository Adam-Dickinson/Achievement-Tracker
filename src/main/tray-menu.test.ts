import type { MenuItem, MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { trayMenuTemplate, type Toggle, type TrayActions } from './tray-menu'

function toggle(on = false): Toggle & { set: ReturnType<typeof vi.fn<(on: boolean) => void>> } {
  return { get: () => on, set: vi.fn<(on: boolean) => void>() }
}

function actions(overrides: Partial<TrayActions> = {}): TrayActions {
  return {
    open: vi.fn(),
    sendTestNotification: vi.fn(),
    quit: vi.fn(),
    pauseNotifications: toggle(),
    startWithWindows: toggle(),
    ...overrides,
  }
}

function item(template: MenuItemConstructorOptions[], label: RegExp): MenuItemConstructorOptions {
  const found = template.find((entry) => entry.label && label.test(entry.label))
  if (!found) throw new Error(`no menu item matching ${label}`)
  return found
}

function click(entry: MenuItemConstructorOptions, checked = false): void {
  entry.click?.({ checked } as MenuItem, undefined, {} as never)
}

describe('trayMenuTemplate', () => {
  it('lists open, test notification, the two toggles and quit, in that order', () => {
    const labels = trayMenuTemplate(actions())
      .filter((entry) => entry.type !== 'separator')
      .map((entry) => entry.label)

    expect(labels).toEqual([
      'Open Trophy Locker',
      'Send test notification',
      'Pause notifications',
      'Start with Windows',
      'Quit',
    ])
  })

  it('calls the matching action for each plain item', () => {
    const tray = actions()
    const template = trayMenuTemplate(tray)

    click(item(template, /^Open/))
    click(item(template, /^Send test/))
    click(item(template, /^Quit/))

    expect(tray.open).toHaveBeenCalledOnce()
    expect(tray.sendTestNotification).toHaveBeenCalledOnce()
    expect(tray.quit).toHaveBeenCalledOnce()
  })

  it('shows each toggle as a checkbox in its current state, and passes the new state on', () => {
    const pause = toggle(true)
    const startup = toggle(false)
    const template = trayMenuTemplate(
      actions({ pauseNotifications: pause, startWithWindows: startup }),
    )

    expect(item(template, /^Pause/)).toMatchObject({ type: 'checkbox', checked: true })
    expect(item(template, /^Start with/)).toMatchObject({ type: 'checkbox', checked: false })

    click(item(template, /^Pause/), false)
    click(item(template, /^Start with/), true)

    expect(pause.set).toHaveBeenCalledWith(false)
    expect(startup.set).toHaveBeenCalledWith(true)
  })

  it('greys out "Start with Windows" and says why when this build cannot do it', () => {
    const template = trayMenuTemplate(actions({ startWithWindows: null }))

    expect(item(template, /^Start with/)).toMatchObject({
      label: 'Start with Windows (installed app only)',
      enabled: false,
      checked: false,
    })
  })
})
