import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import {
  readApiKey,
  readSteamSecret,
  readSteamSignIn,
  requestSteamSession,
  signInSteamId,
  withFamily,
} from './session'

const STEAM_ID = '76561198000000001'
const REFRESH = new Secret(`${STEAM_ID}%7C%7Cfake.refresh.token`)
const KEY = '0123456789ABCDEF0123456789ABCDEF'
const EXPIRES = Date.UTC(2026, 8, 26, 20, 0, 0) / 1000
const SESSION_JWT = `header.${Buffer.from(JSON.stringify({ exp: EXPIRES })).toString('base64url')}.signature`

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/steam', name), 'utf8')
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function json(body: string, status = 200, setCookies: readonly string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  for (const line of setCookies) headers.append('Set-Cookie', line)
  return new Response(body, { status, headers })
}

function signedIn(): Response {
  return json('', 200, [
    `steamLoginSecure=${STEAM_ID}%7C%7C${SESSION_JWT}; Path=/; Secure; HttpOnly`,
  ])
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('the stored Steam secret', () => {
  it('reads a plain API key, as saved before the family library existed', () => {
    const { key, family } = readSteamSecret(new Secret(KEY))

    expect(key.expose()).toBe(KEY)
    expect(family).toBeNull()
  })

  it('adds the family sign-in next to the key, and reads both back', () => {
    const stored = withFamily(new Secret(KEY), REFRESH)
    const { key, family } = readSteamSecret(stored)

    expect(key.expose()).toBe(KEY)
    expect(family?.expose()).toBe(REFRESH.expose())
    expect(readSteamSecret(withFamily(stored, new Secret('newer'))).family?.expose()).toBe('newer')
  })

  it('reports a stored value it cannot read as expired', () => {
    expect(() => readSteamSecret(new Secret('{"family":"x"}'))).toThrow(ProviderError)
    expect(() => readSteamSecret(new Secret('{not json'))).toThrow('not usable')
  })
})

describe('readSteamSignIn', () => {
  it("keeps only Steam's refresh cookie from the sign-in window", () => {
    const secret = readSteamSignIn([
      { name: 'steamLoginSecure', value: 'session' },
      { name: 'steamRefresh_steam', value: REFRESH.expose() },
      { name: 'sessionid', value: 'x' },
    ])

    expect(secret?.expose()).toBe(REFRESH.expose())
    expect(secret && signInSteamId(secret)).toBe(STEAM_ID)
  })

  it('waits while there is no refresh cookie, or one without a SteamID', () => {
    expect(readSteamSignIn([{ name: 'steamLoginSecure', value: 'session' }])).toBeNull()
    expect(readSteamSignIn([{ name: 'steamRefresh_steam', value: 'nobody%7C%7Cx' }])).toBeNull()
  })
})

describe('requestSteamSession', () => {
  it('trades the refresh token for a 24-hour store session, as the Steam website does', async () => {
    fetchMock
      .mockResolvedValueOnce(json(fixture('family-refresh-ticket.json')))
      .mockResolvedValueOnce(signedIn())

    const token = await requestSteamSession(REFRESH, 'store')

    expect(token.token).toBeInstanceOf(Secret)
    expect(token.token.expose()).toBe(SESSION_JWT)
    expect(token.cookie.expose()).toBe(`${STEAM_ID}%7C%7C${SESSION_JWT}`)
    expect(token.expiresAt).toEqual(new Date(EXPIRES * 1000))

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[0] ?? []
    expect(refreshUrl).toBe('https://login.steampowered.com/jwt/ajaxrefresh')
    expect(refreshInit?.method).toBe('POST')
    expect(refreshInit?.headers).toMatchObject({
      Cookie: `steamRefresh_steam=${REFRESH.expose()}`,
      Origin: 'https://store.steampowered.com',
      Referer: 'https://store.steampowered.com/',
    })
    const [setTokenUrl, setTokenInit] = fetchMock.mock.calls[1] ?? []
    expect(setTokenUrl).toBe('https://store.steampowered.com/login/settoken')
    expect(Object.fromEntries(new URLSearchParams(String(setTokenInit?.body)))).toEqual({
      steamID: STEAM_ID,
      nonce: 'fake-nonce',
      redir: '/',
      auth: 'fake-auth',
    })
  })

  it('reports a refresh cookie Steam no longer accepts (error 79) as expired', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture('family-refresh-expired.json')))

    expect((await errorFrom(requestSteamSession(REFRESH, 'store'))).kind).toBe('auth_expired')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('never posts the ticket anywhere but the Steam store', async () => {
    const ticket = {
      ...JSON.parse(fixture('family-refresh-ticket.json')),
      login_url: 'https://evil.example/',
    }
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(ticket)))

    expect((await errorFrom(requestSteamSession(REFRESH, 'store'))).kind).toBe('parse')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reports a store that sets no session as expired', async () => {
    fetchMock
      .mockResolvedValueOnce(json(fixture('family-refresh-ticket.json')))
      .mockResolvedValueOnce(json('', 200, ['sessionid=x; Path=/']))

    expect((await errorFrom(requestSteamSession(REFRESH, 'store'))).kind).toBe('auth_expired')
  })

  it('reports a refused request (Steam answers 403 without browser headers) as an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }))

    expect((await errorFrom(requestSteamSession(REFRESH, 'store'))).kind).toBe('other')
  })

  it('reports failed connections and server errors as retryable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await errorFrom(requestSteamSession(REFRESH, 'store'))).kind).toBe('network')

    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    expect((await errorFrom(requestSteamSession(REFRESH, 'store'))).kind).toBe('network')
  })
})

describe('requestSteamSession for Steam Community', () => {
  it('asks for a community session with the community as origin, and posts the ticket there', async () => {
    const ticket = {
      ...JSON.parse(fixture('family-refresh-ticket.json')),
      login_url: 'https://steamcommunity.com/login/settoken',
    }
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(ticket))).mockResolvedValueOnce(signedIn())

    await requestSteamSession(REFRESH, 'community')

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Origin: 'https://steamcommunity.com',
      Referer: 'https://steamcommunity.com/',
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://steamcommunity.com/login/settoken')
  })

  it("refuses a ticket meant for the store's address", async () => {
    fetchMock.mockResolvedValueOnce(json(fixture('family-refresh-ticket.json')))

    expect((await errorFrom(requestSteamSession(REFRESH, 'community'))).kind).toBe('parse')
  })
})

describe('readApiKey', () => {
  const COMMUNITY_TICKET = JSON.stringify({
    ...JSON.parse(fixture('family-refresh-ticket.json')),
    login_url: 'https://steamcommunity.com/login/settoken',
  })

  function page(html: string, status = 200, location?: string): Response {
    return new Response(html, {
      status,
      headers: { 'content-type': 'text/html; charset=UTF-8', ...(location ? { location } : {}) },
    })
  }

  function withPage(reply: Response): void {
    fetchMock
      .mockResolvedValueOnce(json(COMMUNITY_TICKET))
      .mockResolvedValueOnce(signedIn())
      .mockResolvedValueOnce(reply)
  }

  it("reads the account's Web API key from its developer page with a community session", async () => {
    withPage(page(fixture('dev-apikey.html')))

    const key = await readApiKey(REFRESH)

    expect(key).toBeInstanceOf(Secret)
    expect(key?.expose()).toBe(KEY)
    const [url, init] = fetchMock.mock.calls[2] ?? []
    expect(url).toBe('https://steamcommunity.com/dev/apikey')
    expect(init?.headers).toMatchObject({
      Cookie: `steamLoginSecure=${STEAM_ID}%7C%7C${SESSION_JWT}`,
    })
  })

  it('finds nothing on the page of an account without a key', async () => {
    withPage(page('<div id="bodyContents_ex"><h2>Register your Steam Web API Key</h2></div>'))

    expect(await readApiKey(REFRESH)).toBeNull()
  })

  it('reports a redirect to the sign-in page as an expired sign-in', async () => {
    withPage(page('', 302, 'https://steamcommunity.com/login/home/?goto=%2Fdev%2Fapikey'))

    expect((await errorFrom(readApiKey(REFRESH))).kind).toBe('auth_expired')
  })

  it('reports a failed page load as a network error', async () => {
    fetchMock
      .mockResolvedValueOnce(json(COMMUNITY_TICKET))
      .mockResolvedValueOnce(signedIn())
      .mockRejectedValueOnce(new TypeError('fetch failed'))

    expect((await errorFrom(readApiKey(REFRESH))).kind).toBe('network')
  })
})
