import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Secret } from '@shared/secret'
import {
  CookieSignIn,
  type CookieSignInWindow,
  isBackHome,
  isOnDomain,
  SIGN_IN_TIMEOUT_MS,
} from './cookie-sign-in'
import type { BrowserCookie } from './providers/browser-cookie'
import { readSignInCookies } from './providers/ea/auth'
import { SignInError } from './sign-in-error'

const SIGN_IN_URL = 'https://www.ea.com/login'

const SIGNED_IN: readonly BrowserCookie[] = [
  { name: 'sid', value: 's-1' },
  { name: 'remid', value: 'r-1' },
  { name: '_nx_mpcid', value: 'm-1' },
  { name: '_ga', value: 'analytics' },
]

class FakeWindow implements CookieSignInWindow {
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
const openWindow = vi.fn<(url: string) => CookieSignInWindow>(() => {
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

function signIn(): CookieSignIn {
  return new CookieSignIn({ service: 'EA', url: SIGN_IN_URL, read: readSignInCookies, openWindow })
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

describe('CookieSignIn', () => {
  it("opens the service's sign-in page and resolves with what its reader keeps from the cookies", async () => {
    const running = signIn().run()
    const [window] = windows

    window?.arriveHome(SIGNED_IN)
    const cookies = await running

    expect(openWindow).toHaveBeenCalledWith(SIGN_IN_URL)
    expect(cookies).toBeInstanceOf(Secret)
    expect(cookiesOf(cookies)).toEqual({ sid: 's-1', remid: 'r-1', _nx_mpcid: 'm-1' })
    expect(window?.closeCalls).toBe(1)
  })

  it('keeps waiting while the reader finds no sign-in yet', async () => {
    const running = signIn().run()
    const [window] = windows

    window?.arriveHome([{ name: '_nx_mpcid', value: 'm-1' }])
    expect(window?.closeCalls).toBe(0)

    window?.arriveHome(SIGNED_IN)
    expect(cookiesOf(await running)).toMatchObject({ sid: 's-1' })
  })

  it('reports closing the window as cancelled, naming the service', async () => {
    const running = signIn().run()

    windows[0]?.closeByUser()

    const failure = await failureOf(running)
    expect(failure.reason).toBe('cancelled')
    expect(failure.message).toBe('The EA sign-in was cancelled')
  })

  it('closes the window and reports cancelled when cancelled from the app', async () => {
    const flow = signIn()
    const running = flow.run()

    flow.cancel()

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
    const flow = signIn()
    const first = flow.run()
    const second = flow.run()

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

describe('isBackHome', () => {
  const backOnEa = isBackHome('https://www.ea.com')

  it.each(['https://www.ea.com/', 'https://www.ea.com/games', 'https://www.ea.com/?setLocale=en'])(
    'counts %s as back home after signing in',
    (address) => {
      expect(backOnEa(address)).toBe(true)
    },
  )

  it.each([
    'https://www.ea.com/login',
    'https://www.ea.com/login_check',
    'https://signin.ea.com/p/juno/login',
    'http://www.ea.com/',
    'not a url',
  ])('does not count %s', (address) => {
    expect(backOnEa(address)).toBe(false)
  })
})

describe('isOnDomain', () => {
  it.each([
    ['.ea.com', 'ea.com'],
    ['ea.com', 'ea.com'],
    ['login.steampowered.com', 'steampowered.com'],
    ['.steampowered.com', 'steampowered.com'],
    ['Store.SteamPowered.com', 'steampowered.com'],
  ])('keeps a cookie for %s on %s, including one set on a single subdomain', (cookie, domain) => {
    expect(isOnDomain(cookie, domain)).toBe(true)
  })

  it.each([
    ['steamcommunity.com', 'steampowered.com'],
    ['notsteampowered.com', 'steampowered.com'],
    ['ea.com.example.org', 'ea.com'],
    ['', 'ea.com'],
  ])('leaves out a cookie for %s when reading %s', (cookie, domain) => {
    expect(isOnDomain(cookie, domain)).toBe(false)
  })
})
