import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Secret } from '@shared/secret'
import { SignInError } from './sign-in-error'
import {
  SIGN_IN_TIMEOUT_MS,
  type SignInWindow,
  UBISOFT_SIGN_IN_URL,
  UbisoftSignIn,
} from './ubisoft-sign-in'

const SESSION_REPLY = readFileSync(resolve('tests/fixtures/ubisoft/session.json'), 'utf8')

class FakeWindow implements SignInWindow {
  readonly #replies: ((body: string) => void)[] = []
  readonly #closed: (() => void)[] = []
  closeCalls = 0

  onSessionReply(listener: (body: string) => void): void {
    this.#replies.push(listener)
  }

  onClosed(listener: () => void): void {
    this.#closed.push(listener)
  }

  close(): void {
    this.closeCalls += 1
  }

  reply(body: string): void {
    for (const listener of this.#replies) listener(body)
  }

  closeByUser(): void {
    for (const listener of this.#closed) listener()
  }
}

let windows: FakeWindow[] = []
const openWindow = vi.fn<(url: string) => SignInWindow>(() => {
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

function signIn(): UbisoftSignIn {
  return new UbisoftSignIn({ openWindow })
}

async function failureOf(run: Promise<unknown>): Promise<SignInError> {
  const error: unknown = await run.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof SignInError)) throw new Error(`expected a SignInError, got ${error}`)
  return error
}

describe('UbisoftSignIn', () => {
  it("opens Ubisoft's sign-in page and resolves with the remember-me ticket from its session reply", async () => {
    const running = signIn().run()
    const [window] = windows

    window?.reply(SESSION_REPLY)
    const ticket = await running

    expect(openWindow).toHaveBeenCalledWith(UBISOFT_SIGN_IN_URL)
    expect(ticket).toBeInstanceOf(Secret)
    expect(ticket.expose()).toBe('fake-remember-me-0002')
    expect(window?.closeCalls).toBe(1)
  })

  it('ignores replies that carry no session, such as a wrong password or a 2-step code prompt', async () => {
    const running = signIn().run()
    const [window] = windows

    window?.reply('{"errorCode":1,"httpCode":401,"message":"Invalid credentials"}')
    window?.reply('{"ticket":null,"twoFactorAuthenticationTicket":"pending"}')
    window?.reply('not json')
    expect(window?.closeCalls).toBe(0)

    window?.reply(SESSION_REPLY)
    expect((await running).expose()).toBe('fake-remember-me-0002')
  })

  it('reports closing the window as cancelled', async () => {
    const running = signIn().run()

    windows[0]?.closeByUser()

    expect((await failureOf(running)).reason).toBe('cancelled')
  })

  it('closes the window and reports cancelled when cancelled from the app', async () => {
    const ubisoft = signIn()
    const running = ubisoft.run()

    ubisoft.cancel()

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
    const ubisoft = signIn()
    const first = ubisoft.run()
    const second = ubisoft.run()

    expect((await failureOf(first)).reason).toBe('cancelled')
    windows[1]?.reply(SESSION_REPLY)
    expect((await second).expose()).toBe('fake-remember-me-0002')
  })

  it('settles only once, even if the window closes after the ticket arrived', async () => {
    const running = signIn().run()
    const [window] = windows

    window?.reply(SESSION_REPLY)
    window?.closeByUser()
    vi.advanceTimersByTime(SIGN_IN_TIMEOUT_MS)

    expect((await running).expose()).toBe('fake-remember-me-0002')
    expect(window?.closeCalls).toBe(1)
  })
})
