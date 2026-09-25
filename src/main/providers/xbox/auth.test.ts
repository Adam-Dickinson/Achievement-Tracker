import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import {
  authorizeUrl,
  createPkce,
  exchangeCode,
  refreshTokens,
  XBOX_CLIENT_ID,
  xboxUserToken,
  xstsSession,
} from './auth'

const NOW = new Date('2026-09-24T12:00:00Z')
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const REDIRECT = 'http://localhost:50481'

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/xbox', name), 'utf8')
}

function reply(body: string, status = 200): Response {
  return new Response(body, { status })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  expect(error.message).not.toMatch(/fake-|secret-/)
  return error
}

function sentForm(): URLSearchParams {
  const body = fetchMock.mock.calls[0]?.[1]?.body
  if (!(body instanceof URLSearchParams)) throw new Error('expected a form body')
  return body
}

function sentJson(): unknown {
  const body = fetchMock.mock.calls[0]?.[1]?.body
  if (typeof body !== 'string') throw new Error('expected a JSON body')
  return JSON.parse(body)
}

function sentHeaders(): Headers {
  return new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
}

describe('createPkce', () => {
  it('makes a challenge that is the SHA-256 of the verifier, base64url-encoded', () => {
    const { verifier, challenge } = createPkce()

    expect(verifier.expose()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(challenge).toBe(createHash('sha256').update(verifier.expose()).digest('base64url'))
  })

  it('makes a new verifier every time', () => {
    expect(createPkce().verifier.expose()).not.toBe(createPkce().verifier.expose())
  })
})

describe('authorizeUrl', () => {
  it('builds the consumers sign-in URL with PKCE and the Xbox scope', () => {
    const url = new URL(authorizeUrl(REDIRECT, 'the-challenge', 'the-state'))

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: XBOX_CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT,
      scope: 'XboxLive.signin offline_access',
      code_challenge: 'the-challenge',
      code_challenge_method: 'S256',
      state: 'the-state',
      prompt: 'select_account',
    })
  })
})

describe('exchangeCode', () => {
  it('trades the code and verifier for tokens', async () => {
    fetchMock.mockResolvedValue(reply(fixture('ms-token.json')))

    const tokens = await exchangeCode('the-code', REDIRECT, new Secret('the-verifier'))

    expect(fetchMock.mock.calls[0]?.[0]).toBe(TOKEN_URL)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(Object.fromEntries(sentForm())).toEqual({
      client_id: XBOX_CLIENT_ID,
      scope: 'XboxLive.signin offline_access',
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: REDIRECT,
      code_verifier: 'the-verifier',
    })
    expect(tokens.accessToken.expose()).toBe('fake-ms-access-token')
    expect(tokens.refreshToken.expose()).toBe('fake-ms-refresh-token')
    expect(tokens.expiresAt).toEqual(new Date(NOW.getTime() + 3599 * 1000))
  })

  it('treats a used or expired code as a failed sign-in, not an expired account', async () => {
    fetchMock.mockResolvedValue(
      reply('{"error":"invalid_grant","error_description":"AADSTS70008"}', 400),
    )

    expect((await errorFrom(exchangeCode('old', REDIRECT, new Secret('v')))).kind).toBe('other')
  })
})

describe('refreshTokens', () => {
  it('sends the refresh token and returns the new pair', async () => {
    fetchMock.mockResolvedValue(reply(fixture('ms-refresh.json')))

    const tokens = await refreshTokens(new Secret('fake-ms-refresh-token'))

    expect(Object.fromEntries(sentForm())).toEqual({
      client_id: XBOX_CLIENT_ID,
      scope: 'XboxLive.signin offline_access',
      grant_type: 'refresh_token',
      refresh_token: 'fake-ms-refresh-token',
    })
    expect(tokens.accessToken.expose()).toBe('fake-ms-access-token-2')
    expect(tokens.refreshToken.expose()).toBe('fake-ms-refresh-token-2')
  })

  it('treats invalid_grant as an expired sign-in', async () => {
    fetchMock.mockResolvedValue(reply('{"error":"invalid_grant"}', 400))

    const error = await errorFrom(refreshTokens(new Secret('fake-dead')))

    expect(error.kind).toBe('auth_expired')
  })

  it('reports other Microsoft errors by their code', async () => {
    fetchMock.mockResolvedValue(reply('{"error":"invalid_client"}', 401))

    const error = await errorFrom(refreshTokens(new Secret('fake-token')))

    expect(error.kind).toBe('other')
    expect(error.message).toContain('invalid_client')
  })

  it('reports an error reply that is not JSON by its status', async () => {
    fetchMock.mockResolvedValue(reply('Bad Request', 400))

    const error = await errorFrom(refreshTokens(new Secret('fake-token')))

    expect(error.kind).toBe('other')
    expect(error.message).toContain('HTTP 400')
  })

  it('throws a parse error when the reply has no refresh token', async () => {
    fetchMock.mockResolvedValue(reply('{"access_token":"fake-a","expires_in":3599}'))

    expect((await errorFrom(refreshTokens(new Secret('fake-token')))).kind).toBe('parse')
  })
})

describe('xboxUserToken', () => {
  it('sends the access token with the d= prefix and returns the user token', async () => {
    fetchMock.mockResolvedValue(reply(fixture('user-token.json')))

    const user = await xboxUserToken(new Secret('fake-ms-access-token'))

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://user.auth.xboxlive.com/user/authenticate')
    expect(sentHeaders().get('x-xbl-contract-version')).toBe('1')
    expect(sentJson()).toEqual({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: 'd=fake-ms-access-token',
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    })
    expect(user.token.expose()).toBe('fake-user-token')
    expect(user.expiresAt).toEqual(new Date('2026-09-28T18:03:47.1645723Z'))
  })

  it('treats a rejected access token as an expired sign-in', async () => {
    fetchMock.mockResolvedValue(reply('', 401))

    expect((await errorFrom(xboxUserToken(new Secret('fake-a')))).kind).toBe('auth_expired')
  })

  it('reports other failures by their status', async () => {
    fetchMock.mockResolvedValue(reply('', 403))

    expect((await errorFrom(xboxUserToken(new Secret('fake-a')))).message).toContain('HTTP 403')
  })
})

describe('xstsSession', () => {
  it('sends the user token and returns the header, XUID, gamertag and expiry', async () => {
    fetchMock.mockResolvedValue(reply(fixture('xsts.json')))

    const session = await xstsSession(new Secret('fake-user-token'))

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://xsts.auth.xboxlive.com/xsts/authorize')
    expect(sentJson()).toEqual({
      Properties: { SandboxId: 'RETAIL', UserTokens: ['fake-user-token'] },
      RelyingParty: 'http://xboxlive.com',
      TokenType: 'JWT',
    })
    expect(session.authorization.expose()).toBe('XBL3.0 x=1234567890123456789;fake-xsts-token')
    expect(session.xuid).toBe('2535400000000001')
    expect(session.gamertag).toBe('SampleGamer')
    expect(session.expiresAt).toEqual(new Date('2026-09-25T10:03:48.2013242Z'))
  })

  it('keeps the tokens out of logs', async () => {
    fetchMock.mockResolvedValue(reply(fixture('xsts.json')))

    const session = await xstsSession(new Secret('fake-user-token'))

    expect(JSON.stringify(session)).not.toContain('fake-xsts-token')
  })

  it('explains an account without an Xbox profile', async () => {
    fetchMock.mockResolvedValue(reply('{"Identity":"0","XErr":2148916233,"Message":""}', 401))

    const error = await errorFrom(xstsSession(new Secret('fake-u')))

    expect(error.kind).toBe('other')
    expect(error.message).toContain('no Xbox profile')
  })

  it('explains a child account', async () => {
    fetchMock.mockResolvedValue(reply('{"XErr":2148916238}', 401))

    expect((await errorFrom(xstsSession(new Secret('fake-u')))).message).toContain('child account')
  })

  it('reports an unknown XErr by its code', async () => {
    fetchMock.mockResolvedValue(reply('{"XErr":2148916299}', 401))

    expect((await errorFrom(xstsSession(new Secret('fake-u')))).message).toContain(
      'XErr 2148916299',
    )
  })

  it('treats a 401 without an XErr as an expired sign-in', async () => {
    fetchMock.mockResolvedValue(reply('', 401))

    expect((await errorFrom(xstsSession(new Secret('fake-u')))).kind).toBe('auth_expired')
  })

  it('throws a parse error when the reply has no user claims', async () => {
    const body = { Token: 'fake-x', NotAfter: '2026-09-25T10:03:48Z', DisplayClaims: { xui: [] } }
    fetchMock.mockResolvedValue(reply(JSON.stringify(body)))

    expect((await errorFrom(xstsSession(new Secret('fake-u')))).kind).toBe('parse')
  })
})
