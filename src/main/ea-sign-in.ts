import type { Secret } from '@shared/secret'
import { type BrowserCookie, readSignInCookies } from './providers/ea/auth'
import { SignInError } from './sign-in-error'

export const EA_SIGN_IN_URL = 'https://www.ea.com/login'
export const SIGN_IN_TIMEOUT_MS = 10 * 60_000

export interface EaSignInWindow {
  onSignedIn(listener: (cookies: readonly BrowserCookie[]) => void): void
  onClosed(listener: () => void): void
  close(): void
}

export interface EaSignInDeps {
  readonly openWindow: (url: string) => EaSignInWindow
  readonly timeoutMs?: number
}

export class EaSignIn {
  readonly #openWindow: (url: string) => EaSignInWindow
  readonly #timeoutMs: number
  #cancelCurrent: (() => void) | null = null

  constructor(deps: EaSignInDeps) {
    this.#openWindow = deps.openWindow
    this.#timeoutMs = deps.timeoutMs ?? SIGN_IN_TIMEOUT_MS
  }

  run(): Promise<Secret> {
    this.cancel()
    return new Promise<Secret>((resolve, reject) => {
      const window = this.#openWindow(EA_SIGN_IN_URL)
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
        finish(new SignInError('cancelled', 'The EA sign-in was cancelled'))
      const timer = setTimeout(
        () => finish(new SignInError('timed_out', 'The EA sign-in timed out')),
        this.#timeoutMs,
      )

      this.#cancelCurrent = cancel
      window.onSignedIn((cookies) => {
        const signIn = readSignInCookies(cookies)
        if (signIn) finish(signIn)
      })
      window.onClosed(cancel)
    })
  }

  cancel(): void {
    this.#cancelCurrent?.()
  }
}
