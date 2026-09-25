import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { SignInError } from './sign-in-error'
import { XboxSignIn } from './xbox-sign-in'

interface Visit {
  readonly status: number
  readonly text: string
}

function loopback(redirectUri: string, params: Record<string, string>, path = '/'): string {
  const url = new URL(path, redirectUri)
  url.hostname = '127.0.0.1'
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  return url.toString()
}

async function visit(url: string): Promise<Visit> {
  const response = await fetch(url)
  return { status: response.status, text: await response.text() }
}

function browser(answer: (authorize: URL) => Promise<unknown>): {
  open: (url: string) => Promise<void>
  opened: URL[]
  finished: () => Promise<unknown>
} {
  const opened: URL[] = []
  const answers: Promise<unknown>[] = []
  return {
    opened,
    finished: () => Promise.all(answers),
    open: (url) => {
      const authorize = new URL(url)
      opened.push(authorize)
      answers.push(answer(authorize))
      return Promise.resolve()
    },
  }
}

function redirectOf(authorize: URL): string {
  return authorize.searchParams.get('redirect_uri') ?? ''
}

function stateOf(authorize: URL): string {
  return authorize.searchParams.get('state') ?? ''
}

async function failureOf(run: Promise<unknown>): Promise<SignInError> {
  const error: unknown = await run.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof SignInError)) throw new Error(`expected a SignInError, got ${error}`)
  return error
}

describe('XboxSignIn', () => {
  it('opens the Microsoft sign-in page and returns the code from the redirect', async () => {
    const pages: Visit[] = []
    const { open, opened, finished } = browser(async (authorize) => {
      pages.push(
        await visit(
          loopback(redirectOf(authorize), { code: 'the-code', state: stateOf(authorize) }),
        ),
      )
    })

    const result = await new XboxSignIn({ openExternal: open }).run()
    await finished()

    const [authorize] = opened
    expect(authorize?.origin).toBe('https://login.microsoftonline.com')
    expect(result.code).toBe('the-code')
    expect(result.redirectUri).toMatch(/^http:\/\/localhost:\d+$/)
    expect(result.redirectUri).toBe(authorize && redirectOf(authorize))
    expect(authorize?.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(result.codeVerifier.expose()).digest('base64url'),
    )
    expect(pages).toEqual([
      {
        status: 200,
        text: 'Signed in. You can close this tab and go back to Achievement Tracker.',
      },
    ])
  })

  it('uses a new state and verifier for every sign-in', async () => {
    const { open, opened } = browser((authorize) =>
      visit(loopback(redirectOf(authorize), { code: 'c', state: stateOf(authorize) })),
    )
    const signIn = new XboxSignIn({ openExternal: open })

    const first = await signIn.run()
    const second = await signIn.run()

    expect(first.codeVerifier.expose()).not.toBe(second.codeVerifier.expose())
    expect(opened[0] && stateOf(opened[0])).not.toBe(opened[1] && stateOf(opened[1]))
  })

  it('ignores a redirect with the wrong state and keeps waiting for the real one', async () => {
    const pages: Visit[] = []
    const { open, finished } = browser(async (authorize) => {
      const redirect = redirectOf(authorize)
      pages.push(await visit(loopback(redirect, { code: 'forged', state: 'wrong' })))
      pages.push(await visit(loopback(redirect, { code: 'real', state: stateOf(authorize) })))
    })

    const result = await new XboxSignIn({ openExternal: open }).run()
    await finished()

    expect(result.code).toBe('real')
    expect(pages.map((page) => page.status)).toEqual([400, 200])
  })

  it('ignores requests for other paths, such as the favicon', async () => {
    const statuses: number[] = []
    const { open, finished } = browser(async (authorize) => {
      const redirect = redirectOf(authorize)
      statuses.push((await visit(loopback(redirect, {}, '/favicon.ico'))).status)
      statuses.push(
        (await visit(loopback(redirect, { code: 'c', state: stateOf(authorize) }))).status,
      )
    })

    await new XboxSignIn({ openExternal: open }).run()
    await finished()

    expect(statuses).toEqual([404, 200])
  })

  it('fails as denied when Microsoft sends an error instead of a code', async () => {
    const { open } = browser((authorize) =>
      visit(loopback(redirectOf(authorize), { error: 'access_denied', state: stateOf(authorize) })),
    )

    const error = await failureOf(new XboxSignIn({ openExternal: open }).run())

    expect(error.reason).toBe('denied')
    expect(error.message).toContain('access_denied')
  })

  it('times out when nobody finishes the sign-in', async () => {
    const { open } = browser(() => Promise.resolve())

    const error = await failureOf(new XboxSignIn({ openExternal: open, timeoutMs: 20 }).run())

    expect(error.reason).toBe('timed_out')
  })

  it('can be cancelled while it waits', async () => {
    const { open, opened } = browser(() => Promise.resolve())
    const signIn = new XboxSignIn({ openExternal: open })

    const running = signIn.run()
    await vi.waitFor(() => expect(opened).toHaveLength(1))
    signIn.cancel()

    expect((await failureOf(running)).reason).toBe('cancelled')
  })

  it('cancels the previous sign-in when a new one starts', async () => {
    let opens = 0
    const { open, finished } = browser(async (authorize) => {
      opens++
      if (opens === 2) {
        await visit(loopback(redirectOf(authorize), { code: 'c', state: stateOf(authorize) }))
      }
    })
    const signIn = new XboxSignIn({ openExternal: open })

    const first = signIn.run()
    const second = signIn.run()

    expect((await failureOf(first)).reason).toBe('cancelled')
    expect((await second).code).toBe('c')
    await finished()
  })

  it('stops listening once it is done', async () => {
    let redirect = ''
    const { open, finished } = browser((authorize) => {
      redirect = redirectOf(authorize)
      return visit(loopback(redirect, { code: 'c', state: stateOf(authorize) }))
    })

    await new XboxSignIn({ openExternal: open }).run()
    await finished()

    await expect(visit(loopback(redirect, { code: 'late' }))).rejects.toThrow()
  })

  it('stops listening when the browser cannot be opened', async () => {
    let redirect = ''
    const signIn = new XboxSignIn({
      openExternal: (url) => {
        redirect = redirectOf(new URL(url))
        return Promise.reject(new Error('no browser'))
      },
    })

    await expect(signIn.run()).rejects.toThrow('no browser')
    await expect(visit(loopback(redirect, { code: 'late' }))).rejects.toThrow()
  })
})
