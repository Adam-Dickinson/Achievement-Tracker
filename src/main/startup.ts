import type { App } from 'electron'
import type { Toggle } from './tray-menu'

export const HIDDEN_ARG = '--hidden'

export function launchedHidden(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_ARG)
}

export function startWithWindows(
  app: Pick<App, 'isPackaged' | 'getLoginItemSettings' | 'setLoginItemSettings'>,
): Toggle | null {
  if (!app.isPackaged) return null
  const args = [HIDDEN_ARG]
  return {
    get: () => app.getLoginItemSettings({ args }).openAtLogin,
    set: (on) => app.setLoginItemSettings({ openAtLogin: on, args }),
  }
}
