import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Secret } from '@shared/secret'
import { EA_SIGN_IN_URL, EaSignIn, type EaSignInWindow, SIGN_IN_TIMEOUT_MS } from './ea-sign-in'
import type { BrowserCookie } from './providers/ea/auth'
import { SignInError } from './sign-in-error'

const SIGNED_IN: readonly BrowserCookie[] = [
  { name: 'sid', value: 's-1' },
  { name: 'remid', value: 'r-1' },
  { name: '_nx_mpcid', value: 'm-1' },
  { name: '_ga', value: 'analytics' },
]

class FakeWindow implements EaSignInWindow {
  readonly #signedIn: ((cookies: readonly BrowserCookie[]) => void)[] = []
  readonly #closed: (() => void)[] = []
  closeCalls = 0

  onSignedIn(listener: (cookies: readonly BrowserCookie[]) => void): void {
    this.#signedIn.push(listener)
  }

  onClosed(listener: () => void): void {
    this.#closed.push(listener)
  }

  close(): void {
    this.closeCalls += 1
  }

  arriveHome(cookies: readonly BrowserCookie[]): void {
    for (const listener of this.#signedIn) listener(cookies)
  }

  closeByUser(): void {
    for (const listener of this.#closed) listener()
  }
}

let windows: FakeWindow[] = []
const openWindow = vi.fn<(url: string) => EaSignInWindow>(() => {
  const window = new FakeWindow()
  windows.push(window)
  return window
})

beforeEach(() => {
  windows = []
  vi.useFakeTimers()
})

afterEach(() => {
  openWindow.mockClear()
  vi.useRealTimers()
})

function signIn(): EaSignIn {
  return new EaSignIn({ openWindow })
}

function cookiesOf(secret: Secret): unknown {
  return JSON.parse(secret.expose())
}

async function failureOf(run: Promise<unknown>): Promise<SignInError> {
  const error: unknown = await run.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof SignInError)) throw new Error(`expected a SignInError, got ${error}`)
  return error
}

describe('EaSignIn', () => {
  it("opens EA's sign-in page and resolves with only the sign-in cookies once back on ea.com", async () => {
    const running = signIn().run()
    const [window] = windows

    window?.arriveHome(SIGNED_IN)
    const cookies = await running

    expect(openWindow).toHaveBeenCalledWith(EA_SIGN_IN_URL)
    expect(cookies).toBeInstanceOf(Secret)
    expect(cookiesOf(cookies)).toEqual({ sid: 's-1', remid: 'r-1', _nx_mpcid: 'm-1' })
    expect(window?.closeCalls).toBe(1)
  })

  it('keeps waiting while the page has no sign-in yet', async () => {
    const running = signIn().run()
    const [window] = windows

    window?.arriveHome([{ name: '_nx_mpcid', value: 'm-1' }])
    expect(window?.closeCalls).toBe(0)

    window?.arriveHome(SIGNED_IN)
    expect(cookiesOf(await running)).toMatchObject({ sid: 's-1' })
  })

  it('reports closing the window as cancelled', async () => {
    const running = signIn().run()

    windows[0]?.closeByUser()

    expect((await failureOf(running)).reason).toBe('cancelled')
  })

  it('closes the window and reports cancelled when cancelled from the app', async () => {
    const ea = signIn()
    const running = ea.run()

    ea.cancel()

    expect((await failureOf(running)).reason).toBe('cancelled')
    expect(windows[0]?.closeCalls).toBe(1)
  })

  it('gives up after ten minutes', async () => {
    const running = signIn().run()

    vi.advanceTimersByTime(SIGN_IN_TIMEOUT_MS)

    expect((await failureOf(running)).reason).toBe('timed_out')
    expect(windows[0]?.closeCalls).toBe(1)
    expect(SIGN_IN_TIMEOUT_MS).toBe(10 * 60_000)
  })

  it('cancels the previous sign-in when a new one starts', async () => {
    const ea = signIn()
    const first = ea.run()
    const second = ea.run()

    expect((await failureOf(first)).reason).toBe('cancelled')
    windows[1]?.arriveHome(SIGNED_IN)
    expect(cookiesOf(await second)).toMatchObject({ sid: 's-1' })
  })

  it('settles only once, even if the window closes after the sign-in arrived', async () => {
    const running = signIn().run()
    const [window] = windows

    window?.arriveHome(SIGNED_IN)
    window?.closeByUser()
    vi.advanceTimersByTime(SIGN_IN_TIMEOUT_MS)

    expect(cookiesOf(await running)).toMatchObject({ sid: 's-1' })
    expect(window?.closeCalls).toBe(1)
  })
})
