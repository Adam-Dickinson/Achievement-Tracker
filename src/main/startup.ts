import type { App } from 'electron'
import type { Toggle } from './tray-menu'

/** Added to the command line Windows uses at login, so the app starts in the tray. */
export const HIDDEN_ARG = '--hidden'

export function launchedHidden(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_ARG)
}

/**
 * "Start with Windows". Only an installed (packaged) app can register itself: in development
 * Windows would be told to start the bare Electron binary, so this returns null there.
 */
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
