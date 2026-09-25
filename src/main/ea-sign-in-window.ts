import { randomUUID } from 'node:crypto'
import { BrowserWindow, session } from 'electron'
import { chromeUserAgent } from './chrome-user-agent'
import type { BrowserCookie } from './providers/ea/auth'
import type { EaSignInWindow } from './ea-sign-in'
import { allowNavigation, isEaAddress } from './navigation'

const HOME = 'https://www.ea.com'

export function openEaSignInWindow(url: string, parent?: BrowserWindow): EaSignInWindow {
  const partition = session.fromPartition(`ea-sign-in-${randomUUID()}`, { cache: false })
  partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))

  const window = new BrowserWindow({
    parent,
    width: 520,
    height: 780,
    title: 'Sign in to EA',
    autoHideMenuBar: true,
    webPreferences: {
      session: partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const contents = window.webContents
  contents.setUserAgent(chromeUserAgent(contents.getUserAgent()))
  allowNavigation(contents, isEaAddress)

  const signedInListeners: ((cookies: readonly BrowserCookie[]) => void)[] = []
  const closedListeners: (() => void)[] = []

  contents.on('did-navigate', (_event, address) => {
    if (!isBackHome(address)) return
    void partition.cookies.get({ url: HOME }).then(
      (cookies) => {
        const pairs = cookies.map(({ name, value }) => ({ name, value }))
        for (const listener of signedInListeners) listener(pairs)
      },
      () => undefined,
    )
  })
  window.on('closed', () => {
    for (const listener of closedListeners) listener()
  })
  void contents.loadURL(url).catch(() => undefined)

  return {
    onSignedIn: (listener) => signedInListeners.push(listener),
    onClosed: (listener) => closedListeners.push(listener),
    close: () => {
      if (!window.isDestroyed()) window.destroy()
    },
  }
}

function isBackHome(address: string): boolean {
  try {
    const { origin, pathname } = new URL(address)
    return origin === HOME && !pathname.startsWith('/login')
  } catch {
    return false
  }
}
