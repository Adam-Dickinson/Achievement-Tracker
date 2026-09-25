import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { epicGet, epicGraphql, USER_AGENT } from './api'

const LIBRARY_URL = 'https://library-service.live.use1a.on.epicgames.com/library/api/public/items'
const GRAPHQL_URL = 'https://launcher.store.epicgames.com/graphql'
const AUTH = new Secret('bearer eg1~fake-access-token')

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/epic', name), 'utf8')
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

function sentHeaders(): Record<string, string> {
  return fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('epicGet', () => {
  it("sends the token and the launcher's user agent, and returns the JSON", async () => {
    reply(fixture('library-page2.json'))

    const body = await epicGet(LIBRARY_URL, { auth: AUTH })

    expect(body).toMatchObject({ records: expect.any(Array) })
    expect(sentHeaders()).toMatchObject({
      Authorization: 'bearer eg1~fake-access-token',
      'User-Agent': USER_AGENT,
    })
  })

  it("reports Epic's 401 for a bad token as an expired sign-in, naming only the host", async () => {
    reply(fixture('err-library-bad-token.json'), 401)

    const error = await errorFrom(epicGet(LIBRARY_URL, { auth: AUTH }))

    expect(error.kind).toBe('auth_expired')
    expect(error.message).toBe(
      'Epic: library-service.live.use1a.on.epicgames.com rejected the sign-in',
    )
  })

  it('reports 429 as rate limited, with the wait from Retry-After', async () => {
    reply('', 429, { 'retry-after': '30' })

    const error = await errorFrom(epicGet(LIBRARY_URL, { auth: AUTH }))

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterMs).toBe(30_000)
  })

  it('reports a server error or a failed connection as a network problem', async () => {
    reply('<html>down</html>', 503)
    expect((await errorFrom(epicGet(LIBRARY_URL, { auth: AUTH }))).kind).toBe('network')

    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect((await errorFrom(epicGet(LIBRARY_URL, { auth: AUTH }))).kind).toBe('network')
  })

  it('passes a cancellation through untouched', async () => {
    const controller = new AbortController()
    controller.abort()
    const abort = new DOMException('aborted', 'AbortError')
    fetchMock.mockRejectedValue(abort)

    await expect(epicGet(LIBRARY_URL, { auth: AUTH, signal: controller.signal })).rejects.toBe(
      abort,
    )
  })

  it('reports another failure as other, and an empty or broken body as a parse error', async () => {
    reply('{"errorCode":"not_found"}', 404)
    expect((await errorFrom(epicGet(LIBRARY_URL, { auth: AUTH }))).kind).toBe('other')

    reply('')
    expect((await errorFrom(epicGet(LIBRARY_URL, { auth: AUTH }))).kind).toBe('parse')

    reply('{not json')
    expect((await errorFrom(epicGet(LIBRARY_URL, { auth: AUTH }))).kind).toBe('parse')
  })
})

describe('epicGraphql', () => {
  it('posts the query and variables, and returns the data', async () => {
    reply(fixture('schema-none.json'))

    const data = await epicGraphql('query X { x }', { SandboxId: 'abc' }, {})

    expect(data).toEqual(JSON.parse(fixture('schema-none.json')).data)
    const init = fetchMock.mock.calls[0]?.[1]
    expect(fetchMock.mock.calls[0]?.[0]).toBe(GRAPHQL_URL)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'query X { x }',
      variables: { SandboxId: 'abc' },
    })
  })

  it('sends a token only when given one', async () => {
    reply(fixture('schema-none.json'))
    await epicGraphql('query X { x }', {}, {})
    expect(sentHeaders()).not.toHaveProperty('Authorization')

    fetchMock.mockClear()
    reply(fixture('player-none.json'))
    await epicGraphql('query X { x }', {}, { auth: AUTH })
    expect(sentHeaders()).toMatchObject({ Authorization: 'bearer eg1~fake-access-token' })
  })

  it("reports the store's first GraphQL error as other", async () => {
    reply(fixture('err-graphql-bad-query.json'), 400)

    const error = await errorFrom(epicGraphql('{ bad }', {}, {}))

    expect(error.kind).toBe('other')
    expect(error.message).toBe(
      'Epic: the store refused a query (Cannot query field "noSuchField" on type "AchievementQuery".)',
    )
  })

  it('reports the HTML page Epic sends for a bad token (HTTP 500) as a network problem', async () => {
    reply(fixture('err-graphql-bad-token.html'), 500, { 'content-type': 'text/html' })

    expect((await errorFrom(epicGraphql('query X { x }', {}, { auth: AUTH }))).kind).toBe('network')
  })

  it('reports a reply without data as a parse error', async () => {
    reply('{"extensions":{}}')

    expect((await errorFrom(epicGraphql('query X { x }', {}, {}))).kind).toBe('parse')
  })
})
