import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import {
  isPsnRedirect,
  mintTokens,
  PSN_REDIRECT_URI,
  PSN_SIGN_IN_URL,
  readNpsso,
  renewTokens,
} from './auth'

const NOW = new Date('2026-09-25T17:00:00.000Z')
const TOKEN_URL = 'https://ca.account.sony.com/api/authz/v3/oauth/token'
const BASIC = `Basic ${Buffer.from('09515159-7237-4370-9b40-3806e67c0891:ucPjka5tntB2KqsP').toString('base64')}`

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/playstation', name), 'utf8')
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } })
}

function json(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

function sentForm(call: number): URLSearchParams {
  const body = fetchMock.mock.calls[call]?.[1]?.body
  if (!(body instanceof URLSearchParams)) throw new Error('expected a form body')
  return body
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('the sign-in page', () => {
  it("opens Sony's authorization page for the PlayStation App", () => {
    const url = new URL(PSN_SIGN_IN_URL)

    expect(url.origin + url.pathname).toBe(
      'https://ca.account.sony.com/api/authz/v3/oauth/authorize',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      access_type: 'offline',
      client_id: '09515159-7237-4370-9b40-3806e67c0891',
      redirect_uri: PSN_REDIRECT_URI,
      response_type: 'code',
      scope: 'psn:mobile.v2.core psn:clientapp',
    })
  })

  it('recognises the redirect back to the PlayStation App', () => {
    expect(isPsnRedirect(`${PSN_REDIRECT_URI}/?code=v3.abc&cid=1`)).toBe(true)
    expect(isPsnRedirect(`${PSN_REDIRECT_URI}?code=v3.abc`)).toBe(true)
    expect(isPsnRedirect(`${PSN_REDIRECT_URI}.example.com/?code=1`)).toBe(false)
    expect(isPsnRedirect('https://my.account.sony.com/sonyacct/signin/')).toBe(false)
  })
})

describe('readNpsso', () => {
  it('keeps only the npsso cookie', () => {
    const npsso = readNpsso([
      { name: 'bm_sz', value: 'bot-check' },
      { name: 'npsso', value: 'n-1' },
      { name: 'dars', value: 'other' },
    ])

    expect(npsso?.expose()).toBe('n-1')
  })

  it('waits until Sony has set it', () => {
    expect(readNpsso([{ name: 'npsso', value: '' }])).toBeNull()
    expect(readNpsso([{ name: 'KP_uIDz', value: 'k' }])).toBeNull()
  })
})

describe('mintTokens', () => {
  it('trades the npsso cookie for a code, then the code for tokens', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect(`${PSN_REDIRECT_URI}/?code=v3.code&cid=c-1`))
      .mockResolvedValueOnce(json(fixture('token.json')))

    const tokens = await mintTokens(new Secret('n-1'), NOW)

    const [authorizeUrl, authorizeInit] = fetchMock.mock.calls[0] ?? []
    expect(authorizeUrl).toBe(PSN_SIGN_IN_URL)
    expect(authorizeInit).toMatchObject({ headers: { Cookie: 'npsso=n-1' }, redirect: 'manual' })
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[1] ?? []
    expect(tokenUrl).toBe(TOKEN_URL)
    expect(tokenInit).toMatchObject({ method: 'POST', headers: { Authorization: BASIC } })
    expect(Object.fromEntries(sentForm(1))).toEqual({
      code: 'v3.code',
      redirect_uri: PSN_REDIRECT_URI,
      grant_type: 'authorization_code',
      token_format: 'jwt',
    })
    expect(tokens.accessToken.expose()).toBe('example-access-token')
    expect(tokens.refreshToken.expose()).toBe('00000000-0000-4000-8000-000000000001')
    expect(tokens.accessExpiresAt).toEqual(new Date(NOW.getTime() + 3599_000))
    expect(tokens.refreshExpiresAt).toEqual(new Date(NOW.getTime() + 863999_000))
  })

  it('reports an expired npsso, which Sony sends to its sign-in page, as auth_expired', async () => {
    fetchMock.mockResolvedValueOnce(redirect('https://my.account.sony.com/sonyacct/signin/'))

    const error = await errorFrom(mintTokens(new Secret('old'), NOW))

    expect(error.kind).toBe('auth_expired')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reports a redirect without a code as auth_expired', async () => {
    fetchMock.mockResolvedValueOnce(redirect(`${PSN_REDIRECT_URI}/?error=login_required`))

    expect((await errorFrom(mintTokens(new Secret('n-1'), NOW))).kind).toBe('auth_expired')
  })

  it('reports any other reply from the authorization page as unexpected', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad request</html>', { status: 400 }))

    expect((await errorFrom(mintTokens(new Secret('n-1'), NOW))).kind).toBe('other')
  })
})

describe('renewTokens', () => {
  it('asks for new tokens with the refresh token', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture('token.json')))

    const tokens = await renewTokens(new Secret('r-1'), NOW)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(TOKEN_URL)
    expect(Object.fromEntries(sentForm(0))).toEqual({
      refresh_token: 'r-1',
      grant_type: 'refresh_token',
      scope: 'psn:mobile.v2.core psn:clientapp',
      token_format: 'jwt',
    })
    expect(tokens.accessToken.expose()).toBe('example-access-token')
  })

  it('reports a refused refresh token as auth_expired', async () => {
    fetchMock.mockResolvedValueOnce(json(fixture('token-refused.json'), 400))

    expect((await errorFrom(renewTokens(new Secret('bad'), NOW))).kind).toBe('auth_expired')
  })

  it('reports a malformed token reply as a parse error', async () => {
    fetchMock.mockResolvedValueOnce(json('{"access_token":"a"}'))

    expect((await errorFrom(renewTokens(new Secret('r-1'), NOW))).kind).toBe('parse')
  })

  it('reports a server error as retryable', async () => {
    fetchMock.mockResolvedValueOnce(json('{}', 503))

    const error = await errorFrom(renewTokens(new Secret('r-1'), NOW))

    expect(error.kind).toBe('network')
    expect(error.isRetryable).toBe(true)
  })
})
