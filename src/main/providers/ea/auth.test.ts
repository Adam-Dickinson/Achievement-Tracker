import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { readSignInCookies, requestToken } from './auth'

const TOKEN_URL =
  'https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none'
const NOW = new Date('2026-09-25T17:00:00.000Z')
const STORED = new Secret(JSON.stringify({ sid: 's-1', remid: 'r-1', _nx_mpcid: 'm-1' }))

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

function reply(body: string, setCookies: readonly string[] = [], status = 200): void {
  const headers = new Headers()
  for (const line of setCookies) headers.append('Set-Cookie', line)
  fetchMock.mockResolvedValue(new Response(body, { status, headers }))
}

function cookiesOf(secret: Secret): unknown {
  return JSON.parse(secret.expose())
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('readSignInCookies', () => {
  it('keeps only the three sign-in cookies, as one secret', () => {
    const secret = readSignInCookies([
      { name: 'sid', value: 's-1' },
      { name: '_ga', value: 'analytics' },
      { name: 'remid', value: 'r-1' },
      { name: '_nx_mpcid', value: 'm-1' },
      { name: 'PLAY_SESSION', value: 'other' },
    ])

    expect(secret).toBeInstanceOf(Secret)
    expect(cookiesOf(secret as Secret)).toEqual({ sid: 's-1', remid: 'r-1', _nx_mpcid: 'm-1' })
  })

  it('waits for the session cookie, since there is no sign-in without it', () => {
    expect(readSignInCookies([{ name: 'remid', value: 'r-1' }])).toBeNull()
    expect(readSignInCookies([{ name: 'sid', value: '' }])).toBeNull()
    expect(readSignInCookies([])).toBeNull()
  })
})

describe('requestToken', () => {
  it('asks for a token with the stored cookies and a browser user agent', async () => {
    reply(fixture('token.json'))

    await requestToken(STORED, NOW)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(TOKEN_URL)
    expect(init?.headers).toMatchObject({
      Cookie: 'sid=s-1; remid=r-1; _nx_mpcid=m-1',
      'User-Agent': expect.stringContaining('Chrome/'),
    })
  })

  it('returns the token as a secret, expiring after EA\'s "expires_in" (sent as a string)', async () => {
    reply(fixture('token.json'))

    const token = await requestToken(STORED, NOW)

    expect(token.token).toBeInstanceOf(Secret)
    expect(token.token.expose()).toBe('QVQwOjMuMDozLjA6MjQwOmZha2UtdG9rZW4tZm9yLXRlc3Rz')
    expect(token.expiresAt).toEqual(new Date(NOW.getTime() + 14399 * 1000))
  })

  it('keeps the cookies as they were when EA sets nothing new', async () => {
    reply(fixture('token.json'))

    expect(cookiesOf((await requestToken(STORED, NOW)).cookies)).toEqual(cookiesOf(STORED))
  })

  it('applies a rotated remember-me cookie and a new session cookie, ignoring deletions', async () => {
    reply(fixture('token.json'), [
      'remid=r-2; Expires=Tue, 24 Nov 2026 19:08:46 GMT; Path=/; Domain=.ea.com; Secure; HttpOnly',
      'remid=r-old; Expires=Thu, 01 Jan 1970 00:00:10 GMT; Path=/connect',
      'sid=s-2; Path=/; Domain=.ea.com; Secure; HttpOnly',
      'sid=; Max-Age=0',
      'tracking=x; Path=/',
    ])

    const token = await requestToken(STORED, NOW)

    expect(cookiesOf(token.cookies)).toEqual({ sid: 's-2', remid: 'r-2', _nx_mpcid: 'm-1' })
  })

  it('sends only the cookies it has', async () => {
    reply(fixture('token.json'))

    await requestToken(new Secret(JSON.stringify({ sid: 's-1' })), NOW)

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Cookie: 'sid=s-1' })
  })

  it('reports login_required (which EA sends with HTTP 200) as an expired sign-in', async () => {
    reply(fixture('token-login-required.json'))

    expect((await errorFrom(requestToken(STORED, NOW))).kind).toBe('auth_expired')
  })

  it('reports a stored sign-in it cannot read as expired, without asking EA', async () => {
    for (const stored of ['not json', '{}', '{"_nx_mpcid":"m-1"}']) {
      expect((await errorFrom(requestToken(new Secret(stored), NOW))).kind).toBe('auth_expired')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a reply without a token as a parse error', async () => {
    reply('{"token_type":"Bearer"}')

    expect((await errorFrom(requestToken(STORED, NOW))).kind).toBe('parse')
  })

  it('reports another refused reply as an error', async () => {
    reply('{"message":"nope"}', [], 400)

    expect((await errorFrom(requestToken(STORED, NOW))).kind).toBe('other')
  })
})
