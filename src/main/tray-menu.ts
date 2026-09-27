import type { MenuItemConstructorOptions } from 'electron'

export interface Toggle {
  get(): boolean
  set(on: boolean): void
}

export interface TrayActions {
  open(): void
  syncNow(): void
  sendTestNotification(): void
  quit(): void
  readonly pauseNotifications: Toggle
  readonly startWithWindows: Toggle | null
}

export function trayMenuTemplate(actions: TrayActions): MenuItemConstructorOptions[] {
  return [
    { label: 'Open Trophy Locker', click: () => actions.open() },
    { label: 'Sync now', click: () => actions.syncNow() },
    { label: 'Send test notification', click: () => actions.sendTestNotification() },
    { type: 'separator' },
    {
      label: 'Pause notifications',
      type: 'checkbox',
      checked: actions.pauseNotifications.get(),
      click: (item) => actions.pauseNotifications.set(item.checked),
    },
    {
      label: actions.startWithWindows
        ? 'Start with Windows'
        : 'Start with Windows (installed app only)',
      type: 'checkbox',
      enabled: actions.startWithWindows !== null,
      checked: actions.startWithWindows?.get() ?? false,
      click: (item) => actions.startWithWindows?.set(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => actions.quit() },
  ]
}
