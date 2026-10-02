import type { MenuItem, MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { trayMenuTemplate, type Toggle, type TrayActions } from './tray-menu'

function toggle(on = false): Toggle & { set: ReturnType<typeof vi.fn<(on: boolean) => void>> } {
  return { get: () => on, set: vi.fn<(on: boolean) => void>() }
}

function actions(overrides: Partial<TrayActions> = {}): TrayActions {
  return {
    open: vi.fn(),
    syncNow: vi.fn(),
    sendTestNotification: vi.fn(),
    quit: vi.fn(),
    pauseNotifications: toggle(),
    startWithWindows: toggle(),
    updateLabel: () => null,
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
  it('lists open, sync now, test notification, the two toggles and quit, in that order', () => {
    const labels = trayMenuTemplate(actions())
      .filter((entry) => entry.type !== 'separator')
      .map((entry) => entry.label)

    expect(labels).toEqual([
      'Open Trophy Locker',
      'Sync now',
      'Send test notification',
      'Pause notifications',
      'Start with Windows',
      'Quit',
    ])
  })

  it('adds an update entry under Open when an update is known, and opens the window from it', () => {
    const tray = actions({ updateLabel: () => 'Update available: v1.1.0' })

    const template = trayMenuTemplate(tray)
    const labels = template.filter((entry) => entry.type !== 'separator').map((e) => e.label)
    click(item(template, /Update available/))

    expect(labels.slice(0, 2)).toEqual(['Open Trophy Locker', 'Update available: v1.1.0'])
    expect(tray.open).toHaveBeenCalledOnce()
  })

  it('has no update entry when there is nothing to report', () => {
    const labels = trayMenuTemplate(actions()).map((entry) => entry.label ?? '')

    expect(labels.some((label) => /update/i.test(label))).toBe(false)
  })

  it('calls the matching action for each plain item', () => {
    const tray = actions()
    const template = trayMenuTemplate(tray)

    click(item(template, /^Open/))
    click(item(template, /^Sync now/))
    click(item(template, /^Send test/))
    click(item(template, /^Quit/))

    expect(tray.open).toHaveBeenCalledOnce()
    expect(tray.syncNow).toHaveBeenCalledOnce()
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
