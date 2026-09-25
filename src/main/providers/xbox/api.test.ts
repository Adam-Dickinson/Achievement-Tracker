import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { xblGet, xboxFetch } from './api'

const AUTH = new Secret('XBL3.0 x=1234567890123456789;fake-xsts-token')
const XUID = '2535400000000001'
const TITLEHUB = `https://titlehub.xboxlive.com/users/xuid(${XUID})/titles/titlehistory/decoration/achievement`

function reply(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  expect(error.message).not.toContain('fake-xsts-token')
  expect(error.message).not.toContain(XUID)
  return error
}

function requestHeaders(): Headers {
  return new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
}

describe('xblGet', () => {
  it('sends the Xbox Live headers and returns the parsed JSON', async () => {
    const body = readFileSync(resolve('tests/fixtures/xbox/titlehub-history.json'), 'utf8')
    fetchMock.mockResolvedValue(reply(body, 200, { 'content-type': 'application/json' }))

    const json = await xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2 })

    expect(json).toEqual(JSON.parse(body))
    expect(fetchMock.mock.calls[0]?.[0]).toBe(TITLEHUB)
    expect(requestHeaders().get('authorization')).toBe(AUTH.expose())
    expect(requestHeaders().get('x-xbl-contract-version')).toBe('2')
    expect(requestHeaders().get('accept-language')).toBe('en-GB')
    expect(requestHeaders().get('accept')).toBe('application/json')
  })

  it('sends the contract version it is given', async () => {
    fetchMock.mockResolvedValue(reply('{}', 200))

    await xblGet(TITLEHUB, { auth: AUTH, contractVersion: 4 })

    expect(requestHeaders().get('x-xbl-contract-version')).toBe('4')
  })

  it('passes the abort signal to fetch', async () => {
    fetchMock.mockResolvedValue(reply('{}', 200))
    const controller = new AbortController()

    await xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2, signal: controller.signal })

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it('treats a 401 (the empty reply to a bad token) as expired sign-in', async () => {
    fetchMock.mockResolvedValue(
      reply('', 401, { 'www-authenticate': "Token realm='xboxlive.com', error='token_required'" }),
    )

    const error = await errorFrom(xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2 }))

    expect(error.kind).toBe('auth_expired')
    expect(error.message).toContain('titlehub.xboxlive.com')
  })

  it('reports other client errors with their status', async () => {
    fetchMock.mockResolvedValue(reply('{"code":403}', 403))

    const error = await errorFrom(xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2 }))

    expect(error.kind).toBe('other')
    expect(error.message).toContain('HTTP 403')
  })

  it('treats a 429 as rate limited and honours Retry-After', async () => {
    fetchMock.mockResolvedValue(reply('', 429, { 'retry-after': '30' }))

    const error = await errorFrom(xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2 }))

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterMs).toBe(30_000)
  })

  it('leaves the retry delay to the scheduler when a 429 has no Retry-After', async () => {
    fetchMock.mockResolvedValue(reply('', 429))

    expect(
      (await errorFrom(xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2 }))).retryAfterMs,
    ).toBeNull()
  })

  it('treats a server error as a network problem', async () => {
    fetchMock.mockResolvedValue(reply('oops', 503))

    const error = await errorFrom(xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2 }))

    expect(error.kind).toBe('network')
    expect(error.message).toContain('HTTP 503')
  })

  it('treats a failed connection as a network problem and keeps the cause', async () => {
    const cause = new TypeError('fetch failed')
    fetchMock.mockRejectedValue(cause)

    const error = await errorFrom(xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2 }))

    expect(error.kind).toBe('network')
    expect(error.cause).toBe(cause)
  })

  it('lets an abort through unchanged', async () => {
    const controller = new AbortController()
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    controller.abort(abort)
    fetchMock.mockRejectedValue(abort)

    await expect(
      xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2, signal: controller.signal }),
    ).rejects.toBe(abort)
  })

  it('throws a parse error for a success reply that is not JSON', async () => {
    fetchMock.mockResolvedValue(reply('<html></html>', 200))

    expect((await errorFrom(xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2 }))).kind).toBe(
      'parse',
    )
  })

  it('throws a parse error for an empty success reply', async () => {
    fetchMock.mockResolvedValue(reply('', 200))

    const error = await errorFrom(xblGet(TITLEHUB, { auth: AUTH, contractVersion: 2 }))

    expect(error.kind).toBe('parse')
    expect(error.message).toContain('empty reply')
  })
})

describe('xboxFetch', () => {
  it('returns a client error reply with its JSON body instead of throwing', async () => {
    fetchMock.mockResolvedValue(reply('{"error":"invalid_grant"}', 400))

    await expect(xboxFetch('https://login.microsoftonline.com/x', {})).resolves.toEqual({
      ok: false,
      status: 400,
      body: { error: 'invalid_grant' },
    })
  })

  it('keeps a non-JSON error body as text', async () => {
    fetchMock.mockResolvedValue(reply('Bad Request', 400))

    expect((await xboxFetch('https://login.microsoftonline.com/x', {})).body).toBe('Bad Request')
  })

  it('gives null for an empty body', async () => {
    fetchMock.mockResolvedValue(reply('', 401))

    expect((await xboxFetch('https://xsts.auth.xboxlive.com/x', {})).body).toBeNull()
  })

  it('still throws for a rate limit or a server error', async () => {
    fetchMock.mockResolvedValueOnce(reply('', 429)).mockResolvedValueOnce(reply('', 500))

    expect((await errorFrom(xboxFetch('https://xsts.auth.xboxlive.com/x', {}))).kind).toBe(
      'rate_limited',
    )
    expect((await errorFrom(xboxFetch('https://xsts.auth.xboxlive.com/x', {}))).kind).toBe(
      'network',
    )
  })
})
