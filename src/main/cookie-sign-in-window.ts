import { randomUUID } from 'node:crypto'
import { BrowserWindow, session } from 'electron'
import { chromeUserAgent } from './chrome-user-agent'
import { type CookieSignInWindow, isOnDomain } from './cookie-sign-in'
import { allowNavigation, type NavigationRule } from './navigation'
import type { BrowserCookie } from './providers/browser-cookie'

export interface CookieSignInPage {
  readonly title: string
  readonly isSignedIn: (address: string) => boolean
  readonly cookieDomain: string
  readonly mayNavigate: NavigationRule
}

export function openCookieSignInWindow(
  page: CookieSignInPage,
  url: string,
  parent?: BrowserWindow,
): CookieSignInWindow {
  const partition = session.fromPartition(`sign-in-${randomUUID()}`, { cache: false })
  partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))

  const window = new BrowserWindow({
    parent,
    width: 540,
    height: 800,
    title: page.title,
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
  allowNavigation(contents, page.mayNavigate)

  const signedInListeners: ((cookies: readonly BrowserCookie[]) => void)[] = []
  const closedListeners: (() => void)[] = []

  const readCookies = (): void => {
    void partition.cookies.get({}).then(
      (cookies) => {
        const pairs = cookies
          .filter((cookie) => isOnDomain(cookie.domain ?? '', page.cookieDomain))
          .map(({ name, value }) => ({ name, value }))
        for (const listener of signedInListeners) listener(pairs)
      },
      () => undefined,
    )
  }
  const leavesForApp = (event: { preventDefault(): void }, address: string): void => {
    if (isWebAddress(address) || !page.isSignedIn(address)) return
    event.preventDefault()
    readCookies()
  }

  contents.on('did-navigate', (_event, address) => {
    if (page.isSignedIn(address)) readCookies()
  })
  contents.on('will-redirect', leavesForApp)
  contents.on('will-navigate', leavesForApp)
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

function isWebAddress(address: string): boolean {
  return address.startsWith('https:') || address.startsWith('http:')
}
