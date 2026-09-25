import type { Secret } from '@shared/secret'
import { readSignInReply } from './providers/ubisoft/auth'
import { SignInError } from './sign-in-error'

export const UBISOFT_SIGN_IN_URL = 'https://account.ubisoft.com/login'
export const UBISOFT_SESSIONS_URL = 'https://public-ubiservices.ubi.com/v3/profiles/sessions'
export const SIGN_IN_TIMEOUT_MS = 10 * 60_000

export interface SignInWindow {
  onSessionReply(listener: (body: string) => void): void
  onClosed(listener: () => void): void
  close(): void
}

export interface UbisoftSignInDeps {
  readonly openWindow: (url: string) => SignInWindow
  readonly timeoutMs?: number
}

export class UbisoftSignIn {
  readonly #openWindow: (url: string) => SignInWindow
  readonly #timeoutMs: number
  #cancelCurrent: (() => void) | null = null

  constructor(deps: UbisoftSignInDeps) {
    this.#openWindow = deps.openWindow
    this.#timeoutMs = deps.timeoutMs ?? SIGN_IN_TIMEOUT_MS
  }

  run(): Promise<Secret> {
    this.cancel()
    return new Promise<Secret>((resolve, reject) => {
      const window = this.#openWindow(UBISOFT_SIGN_IN_URL)
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
        finish(new SignInError('cancelled', 'The Ubisoft sign-in was cancelled'))
      const timer = setTimeout(
        () => finish(new SignInError('timed_out', 'The Ubisoft sign-in timed out')),
        this.#timeoutMs,
      )

      this.#cancelCurrent = cancel
      window.onSessionReply((body) => {
        const ticket = readSignInReply(parseJson(body))
        if (ticket) finish(ticket)
      })
      window.onClosed(cancel)
    })
  }

  cancel(): void {
    this.#cancelCurrent?.()
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}
