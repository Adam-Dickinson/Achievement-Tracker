import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { eaAchievements, eaGraphql } from './api'

const GRAPHQL_URL = 'https://service-aggregation-layer.juno.ea.com/graphql'
const TOKEN = new Secret('fake-token-0001')

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/ea', name), 'utf8')
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

describe('eaGraphql', () => {
  it('sends the query in the address with the bearer token, and returns the data', async () => {
    reply(fixture('me.json'))

    const data = await eaGraphql('query{me{player{pd}}}', TOKEN)

    expect(data).toEqual(JSON.parse(fixture('me.json')).data)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${GRAPHQL_URL}?query=${encodeURIComponent('query{me{player{pd}}}')}`)
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer fake-token-0001' })
  })

  it('treats UNAUTHENTICATED (which EA sends with HTTP 200) as an expired token', async () => {
    reply(fixture('me-unauthenticated.json'))

    expect((await errorFrom(eaGraphql('q', TOKEN))).kind).toBe('auth_expired')
  })

  it('treats HTTP 401 as an expired token', async () => {
    reply('', 401)

    expect((await errorFrom(eaGraphql('q', TOKEN))).kind).toBe('auth_expired')
  })

  it('reports any other GraphQL error with its message', async () => {
    reply('{"data":null,"errors":[{"message":"Graphql validation error"}]}')

    const error = await errorFrom(eaGraphql('q', TOKEN))

    expect(error.kind).toBe('other')
    expect(error.message).toContain('Graphql validation error')
  })

  it('rejects a reply without data as a parse error', async () => {
    reply('{"ok":true}')

    expect((await errorFrom(eaGraphql('q', TOKEN))).kind).toBe('parse')
  })

  it('rejects a reply that is not JSON as a parse error', async () => {
    reply('<html>')

    expect((await errorFrom(eaGraphql('q', TOKEN))).kind).toBe('parse')
  })

  it('reports 429 as rate limited with the wait EA asks for', async () => {
    reply('', 429, { 'Retry-After': '30' })

    const error = await errorFrom(eaGraphql('q', TOKEN))

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterMs).toBe(30_000)
  })

  it('reports server errors and failed connections as retryable network errors', async () => {
    reply('', 503)
    expect((await errorFrom(eaGraphql('q', TOKEN))).kind).toBe('network')

    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect((await errorFrom(eaGraphql('q', TOKEN))).kind).toBe('network')
  })

  it('passes an abort on unchanged', async () => {
    const controller = new AbortController()
    controller.abort()
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))

    await expect(eaGraphql('q', TOKEN, controller.signal)).rejects.toThrow('aborted')
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })
})

describe('eaAchievements', () => {
  it("asks for one set of the persona's achievements with the token header", async () => {
    reply(fixture('achievements-apex-legends.json'))

    const body = await eaAchievements('1000000002', '193634_194908_50844', TOKEN)

    expect(body).toEqual(JSON.parse(fixture('achievements-apex-legends.json')))
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(
      'https://achievements.gameservices.ea.com/achievements/personas/1000000002/193634_194908_50844/all?lang=en_US&metadata=true',
    )
    expect(init?.headers).toMatchObject({ 'X-AuthToken': 'fake-token-0001' })
  })

  it('treats HTTP 401 as an expired token', async () => {
    reply(fixture('achievements-unauthorized.json'), 401)

    expect((await errorFrom(eaAchievements('1', 'set', TOKEN))).kind).toBe('auth_expired')
  })

  it('reports another refusal as an error', async () => {
    reply('{"error":{"code":400}}', 400)

    expect((await errorFrom(eaAchievements('1', 'set', TOKEN))).kind).toBe('other')
  })
})
