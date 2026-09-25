import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import {
  EPIC_CLIENT_ID,
  EPIC_SIGN_IN_URL,
  exchangeCode,
  readAuthorizationCode,
  refreshSession,
} from './auth'

const TOKEN_URL = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token'
const NOW = new Date('2026-09-25T15:00:00.000Z')
const CODE = '0123456789abcdef0123456789abcdef'

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

function reply(body: string, status = 200): void {
  fetchMock.mockResolvedValue(new Response(body, { status }))
}

function sentForm(): URLSearchParams {
  return fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('EPIC_SIGN_IN_URL', () => {
  it("sends the browser to Epic's sign-in, which then shows a code for the launcher client", () => {
    const url = new URL(EPIC_SIGN_IN_URL)
    const redirect = new URL(url.searchParams.get('redirectUrl') ?? '')

    expect(url.origin + url.pathname).toBe('https://www.epicgames.com/id/login')
    expect(redirect.origin + redirect.pathname).toBe('https://www.epicgames.com/id/api/redirect')
    expect(redirect.searchParams.get('clientId')).toBe(EPIC_CLIENT_ID)
    expect(redirect.searchParams.get('responseType')).toBe('code')
  })
})

describe('readAuthorizationCode', () => {
  it('accepts the bare code, with spaces around it or in capitals', () => {
    expect(readAuthorizationCode(CODE)).toBe(CODE)
    expect(readAuthorizationCode(`  ${CODE.toUpperCase()}\n`)).toBe(CODE)
  })

  it('finds the code in the whole page Epic shows', () => {
    const page = `{"warning":"Do not share this code with any 3rd party service.","redirectUrl":"https://localhost/launcher/authorized?code=${CODE}","authorizationCode":"${CODE}","exchangeCode":null,"sid":null}`

    expect(readAuthorizationCode(page)).toBe(CODE)
  })

  it('gives null for anything else', () => {
    expect(readAuthorizationCode('')).toBeNull()
    expect(readAuthorizationCode('0123456789abcdef')).toBeNull()
    expect(readAuthorizationCode(`${CODE}0`)).toBeNull()
    expect(readAuthorizationCode('{"authorizationCode":null}')).toBeNull()
  })
})

describe('exchangeCode', () => {
  it("swaps the code for a session with the launcher's client credentials", async () => {
    reply(fixture('token.json'))

    const session = await exchangeCode(new Secret(CODE), NOW)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(TOKEN_URL)
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    const [scheme, credentials] = headers['Authorization']?.split(' ') ?? []
    expect(scheme).toBe('basic')
    expect(Buffer.from(credentials ?? '', 'base64').toString()).toMatch(
      new RegExp(`^${EPIC_CLIENT_ID}:[0-9a-f]{32}$`),
    )
    expect(Object.fromEntries(sentForm())).toEqual({
      grant_type: 'authorization_code',
      code: CODE,
      token_type: 'eg1',
    })

    expect(session.authorization.expose()).toBe('bearer eg1~fake-access-token')
    expect(session.refreshToken.expose()).toBe('eg1~fake-refresh-token')
    expect(session.accountId).toBe('0123456789abcdef0123456789abcdef')
    expect(session.displayName).toBe('TestPlayer')
    expect(session.expiresAt).toEqual(new Date(NOW.getTime() + 129_600_000))
  })

  it('reports a used or expired code as rejected, saying why', async () => {
    reply(fixture('err-code-bad.json'), 400)

    const error = await errorFrom(exchangeCode(new Secret(CODE), NOW))

    expect(error.kind).toBe('auth_expired')
    expect(error.message).toBe('Epic: that sign-in code has expired or was already used')
  })

  it('reports a sign-in reply it does not understand as a parse error', async () => {
    reply('{"access_token":"x"}')

    expect((await errorFrom(exchangeCode(new Secret(CODE), NOW))).kind).toBe('parse')
  })

  it('keeps displayName empty when Epic gives none', async () => {
    const token = { ...JSON.parse(fixture('token.json')), displayName: '' }
    reply(JSON.stringify(token))

    expect((await exchangeCode(new Secret(CODE), NOW)).displayName).toBeNull()
  })
})

describe('refreshSession', () => {
  it('sends the refresh token and returns the new one', async () => {
    reply(fixture('token.json'))

    const session = await refreshSession(new Secret('eg1~old-refresh-token'), NOW)

    expect(Object.fromEntries(sentForm())).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'eg1~old-refresh-token',
      token_type: 'eg1',
    })
    expect(session.refreshToken.expose()).toBe('eg1~fake-refresh-token')
  })

  it('reports a refresh token Epic no longer accepts as an expired sign-in', async () => {
    reply(fixture('err-refresh-bad-token.json'), 400)

    const error = await errorFrom(refreshSession(new Secret('bad'), NOW))

    expect(error.kind).toBe('auth_expired')
    expect(error.message).toBe('Epic: the sign-in has expired')
  })

  it('reports any other failure as other or a network problem', async () => {
    reply('{"message":"nope"}', 403)
    expect((await errorFrom(refreshSession(new Secret('x'), NOW))).kind).toBe('other')

    reply('', 502)
    expect((await errorFrom(refreshSession(new Secret('x'), NOW))).kind).toBe('network')
  })
})
