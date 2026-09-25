import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { UBISOFT_LAUNCHER_APP_ID, ubisoftGraphql } from './api'

const GRAPHQL_URL = 'https://public-ubiservices.ubi.com/v1/profiles/me/uplay/graphql'
const AUTH = { ticket: new Secret('fake-ticket-0001'), sessionId: 'session-1' }

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/ubisoft', name), 'utf8')
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function reply(body: string, status = 200, headers: Record<string, string> = {}): void {
  fetchMock.mockResolvedValue(new Response(body, { status, headers }))
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('ubisoftGraphql', () => {
  it('posts the query as the Ubisoft Connect launcher, with the session, and returns the data', async () => {
    reply(fixture('games.json'))

    const data = await ubisoftGraphql('query X { x }', { spaceId: 'abc' }, AUTH)

    expect(data).toEqual(JSON.parse(fixture('games.json')).data)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(GRAPHQL_URL)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'query X { x }',
      variables: { spaceId: 'abc' },
    })
    expect(init?.headers).toMatchObject({
      'Ubi-AppId': UBISOFT_LAUNCHER_APP_ID,
      'Ubi-SessionId': 'session-1',
      Authorization: 'Ubi_v1 t=fake-ticket-0001',
    })
  })

  it("reports Ubisoft's 401 for a bad ticket as an expired session", async () => {
    reply(fixture('err-bad-ticket.json'), 401)

    const error = await errorFrom(ubisoftGraphql('query X { x }', {}, AUTH))

    expect(error.kind).toBe('auth_expired')
    expect(error.message).toBe('Ubisoft: Ubisoft Connect rejected the session')
  })

  it('reports an INVALID_TICKET error as an expired session even without a 401', async () => {
    reply(fixture('err-bad-ticket.json'))

    expect((await errorFrom(ubisoftGraphql('query X { x }', {}, AUTH))).kind).toBe('auth_expired')
  })

  it("reports another GraphQL error, such as a missing entitlement, as other with Ubisoft's message", async () => {
    reply(fixture('err-entitlement.json'))

    const error = await errorFrom(ubisoftGraphql('query X { x }', {}, AUTH))

    expect(error.kind).toBe('other')
    expect(error.message).toBe(
      'Ubisoft: Ubisoft Connect refused a query (401 Unauthorized from entitlement.api (errorCode=2000))',
    )
  })

  it('reports 429 as rate limited, with the wait from Retry-After', async () => {
    reply('', 429, { 'retry-after': '20' })

    const error = await errorFrom(ubisoftGraphql('query X { x }', {}, AUTH))

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterMs).toBe(20_000)
  })

  it('reports a server error or a failed connection as a network problem', async () => {
    reply('<html>down</html>', 503)
    expect((await errorFrom(ubisoftGraphql('query X { x }', {}, AUTH))).kind).toBe('network')

    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect((await errorFrom(ubisoftGraphql('query X { x }', {}, AUTH))).kind).toBe('network')
  })

  it('passes a cancellation through untouched', async () => {
    const controller = new AbortController()
    controller.abort()
    const abort = new DOMException('aborted', 'AbortError')
    fetchMock.mockRejectedValue(abort)

    await expect(ubisoftGraphql('query X { x }', {}, AUTH, controller.signal)).rejects.toBe(abort)
  })

  it('reports another failed reply as other, and a reply without data or broken JSON as a parse error', async () => {
    reply('{"message":"nope"}', 404)
    expect((await errorFrom(ubisoftGraphql('query X { x }', {}, AUTH))).kind).toBe('other')

    reply('{"extensions":{}}')
    expect((await errorFrom(ubisoftGraphql('query X { x }', {}, AUTH))).kind).toBe('parse')

    reply('{not json')
    expect((await errorFrom(ubisoftGraphql('query X { x }', {}, AUTH))).kind).toBe('parse')
  })
})
