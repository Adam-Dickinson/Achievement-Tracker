import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Secret } from '@shared/secret'
import { authorizeUrl, createPkce } from './providers/xbox/auth'

export const SIGN_IN_TIMEOUT_MS = 5 * 60_000

const DONE_PAGE = 'Signed in. You can close this tab and go back to Achievement Tracker.'
const FAILED_PAGE = 'Sign-in did not finish. Go back to Achievement Tracker and try again.'

export type SignInFailure = 'cancelled' | 'timed_out' | 'denied'

export class SignInError extends Error {
  readonly reason: SignInFailure

  constructor(reason: SignInFailure, message: string) {
    super(message)
    this.name = 'SignInError'
    this.reason = reason
  }
}

export interface MicrosoftAuthorization {
  readonly code: string
  readonly redirectUri: string
  readonly codeVerifier: Secret
}

export interface XboxSignInDeps {
  readonly openExternal: (url: string) => Promise<void>
  readonly timeoutMs?: number
}

export class XboxSignIn {
  readonly #openExternal: (url: string) => Promise<void>
  readonly #timeoutMs: number
  #current: AbortController | null = null

  constructor(deps: XboxSignInDeps) {
    this.#openExternal = deps.openExternal
    this.#timeoutMs = deps.timeoutMs ?? SIGN_IN_TIMEOUT_MS
  }

  async run(): Promise<MicrosoftAuthorization> {
    this.cancel()
    const controller = new AbortController()
    this.#current = controller
    try {
      return await this.#signIn(controller.signal)
    } finally {
      if (this.#current === controller) this.#current = null
    }
  }

  cancel(): void {
    this.#current?.abort()
    this.#current = null
  }

  async #signIn(signal: AbortSignal): Promise<MicrosoftAuthorization> {
    const pkce = createPkce()
    const state = randomBytes(16).toString('base64url')
    const waiting = waitForRedirect(state, signal, this.#timeoutMs)
    try {
      const redirectUri = `http://localhost:${await waiting.port}`
      await this.#openExternal(authorizeUrl(redirectUri, pkce.challenge, state))
      const code = await waiting.code
      return { code, redirectUri, codeVerifier: pkce.verifier }
    } finally {
      waiting.close()
    }
  }
}

interface Waiting {
  readonly port: Promise<number>
  readonly code: Promise<string>
  close(): void
}

function waitForRedirect(state: string, signal: AbortSignal, timeoutMs: number): Waiting {
  let settle: { resolve(code: string): void; reject(error: Error): void } | undefined
  const code = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject }
  })
  code.catch(() => undefined)

  const server: Server = createServer((request, response) =>
    handleRedirect(request, response, state, (outcome) => {
      if (outcome instanceof Error) settle?.reject(outcome)
      else settle?.resolve(outcome)
    }),
  )

  const timer = setTimeout(
    () => settle?.reject(new SignInError('timed_out', 'The Microsoft sign-in timed out')),
    timeoutMs,
  )
  const onAbort = (): void =>
    settle?.reject(new SignInError('cancelled', 'The Microsoft sign-in was cancelled'))
  signal.addEventListener('abort', onAbort, { once: true })

  const port = new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
  })

  return {
    port,
    code,
    close: () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      server.close()
      server.closeIdleConnections()
    },
  }
}

function handleRedirect(
  request: IncomingMessage,
  response: ServerResponse,
  state: string,
  finish: (outcome: string | Error) => void,
): void {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (request.method !== 'GET' || url.pathname !== '/') {
    response.writeHead(404).end()
    return
  }
  if (url.searchParams.get('state') !== state) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(FAILED_PAGE)
    return
  }

  const code = url.searchParams.get('code')
  const done = code !== null && code !== ''
  response
    .writeHead(done ? 200 : 400, { 'Content-Type': 'text/plain; charset=utf-8' })
    .end(done ? DONE_PAGE : FAILED_PAGE)

  if (done) {
    finish(code)
  } else {
    const error = url.searchParams.get('error') ?? 'no_code'
    finish(new SignInError('denied', `Microsoft did not complete the sign-in (${error})`))
  }
}
