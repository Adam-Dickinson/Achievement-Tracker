import type { Secret } from '@shared/secret'
import type { BrowserCookie } from './providers/browser-cookie'
import { SignInError } from './sign-in-error'

export const SIGN_IN_TIMEOUT_MS = 10 * 60_000

export interface CookieSignInWindow {
  onSignedIn(listener: (cookies: readonly BrowserCookie[]) => void): void
  onClosed(listener: () => void): void
  close(): void
}

export interface CookieSignInDeps {
  readonly service: string
  readonly url: string
  readonly read: (cookies: readonly BrowserCookie[]) => Secret | null
  readonly openWindow: (url: string) => CookieSignInWindow
  readonly timeoutMs?: number
}

export function isOnDomain(cookieDomain: string, domain: string): boolean {
  const host = cookieDomain.replace(/^\./, '').toLowerCase()
  return host === domain || host.endsWith(`.${domain}`)
}

export class CookieSignIn {
  readonly #deps: CookieSignInDeps
  #cancelCurrent: (() => void) | null = null

  constructor(deps: CookieSignInDeps) {
    this.#deps = deps
  }

  run(): Promise<Secret> {
    this.cancel()
    const { service, url, read, openWindow, timeoutMs = SIGN_IN_TIMEOUT_MS } = this.#deps
    return new Promise<Secret>((resolve, reject) => {
      const window = openWindow(url)
      let settled = false
      const finish = (outcome: Secret | SignInError): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (this.#cancelCurrent === cancel) this.#cancelCurrent = null
        window.close()
        if (outcome instanceof SignInError) reject(outcome)
        else resolve(outcome)
      }
      const cancel = (): void =>
        finish(new SignInError('cancelled', `The ${service} sign-in was cancelled`))
      const timer = setTimeout(
        () => finish(new SignInError('timed_out', `The ${service} sign-in timed out`)),
        timeoutMs,
      )

      this.#cancelCurrent = cancel
      window.onSignedIn((cookies) => {
        const signIn = read(cookies)
        if (signIn) finish(signIn)
      })
      window.onClosed(cancel)
    })
  }

  cancel(): void {
    this.#cancelCurrent?.()
  }
}
