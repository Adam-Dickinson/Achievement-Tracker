import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import { Secret } from '@shared/secret'
import { UBISOFT_LAUNCHER_APP_ID } from './api'
import { readSignInReply, refreshSession } from './auth'

const SESSIONS_URL = 'https://public-ubiservices.ubi.com/v3/profiles/sessions'
const NOW = new Date('2026-09-25T17:00:00.000Z')
const STORED = new Secret('fake-remember-me-0001')

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

function reply(body: string, status = 200): void {
  fetchMock.mockResolvedValue(new Response(body, { status }))
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('refreshSession', () => {
  it('trades the remember-me ticket for a launcher session', async () => {
    reply(fixture('session.json'))

    await refreshSession(STORED, NOW)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(SESSIONS_URL)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      'Ubi-AppId': UBISOFT_LAUNCHER_APP_ID,
      Authorization: 'rm_v1 t=fake-remember-me-0001',
    })
    expect(JSON.parse(String(init?.body))).toEqual({ rememberMe: true })
  })

  it('returns the ticket, the rotated remember-me ticket and the account, all secrets wrapped', async () => {
    reply(fixture('session.json'))

    const session = await refreshSession(STORED, NOW)

    expect(session.ticket).toBeInstanceOf(Secret)
    expect(session.ticket.expose()).toBe('fake-ticket-0001')
    expect(session.rememberMeTicket.expose()).toBe('fake-remember-me-0002')
    expect(session.sessionId).toBe('00000000-0000-4000-8000-0000000000bb')
    expect(session.userId).toBe('00000000-0000-4000-8000-0000000000aa')
    expect(session.displayName).toBe('TestPlayer')
  })

  it("times the expiry from Ubisoft's own clock, so a wrong local clock does not matter", async () => {
    reply(fixture('session.json'))

    const session = await refreshSession(STORED, NOW)

    const lifetimeMs = session.expiresAt.getTime() - NOW.getTime()
    expect(Math.round(lifetimeMs / 1000)).toBe(3 * 60 * 60)
  })

  it('lower-cases the user ID and treats a blank name as none', async () => {
    const body = {
      ...JSON.parse(fixture('session.json')),
      userId: 'ABCDEF00-0000-4000-8000-0000000000AA',
      nameOnPlatform: ' ',
    }
    reply(JSON.stringify(body))

    const session = await refreshSession(STORED, NOW)

    expect(session.userId).toBe('abcdef00-0000-4000-8000-0000000000aa')
    expect(session.displayName).toBeNull()
  })

  it('reports a remember-me ticket that Ubisoft no longer knows as an expired sign-in', async () => {
    reply(fixture('err-session-expired.json'), 401)

    const error = await errorFrom(refreshSession(STORED, NOW))

    expect(error.kind).toBe('auth_expired')
    expect(error.message).toBe('Ubisoft: the sign-in has expired')
  })

  it('reports a 403 with a Ubisoft error code as an expired sign-in too', async () => {
    reply('{"errorCode":1,"httpCode":403,"message":"Invalid credentials"}', 403)

    expect((await errorFrom(refreshSession(STORED, NOW))).kind).toBe('auth_expired')
  })

  it('reports other failures as other, and a reply in the wrong shape as a parse error', async () => {
    reply('<html>bad request</html>', 400)
    expect((await errorFrom(refreshSession(STORED, NOW))).kind).toBe('other')

    reply('{"ticket":"t"}')
    expect((await errorFrom(refreshSession(STORED, NOW))).kind).toBe('parse')
  })

  it('never puts a ticket in an error message', async () => {
    reply('{"ticket":"t","rememberMeTicket":"leaky"}')

    const error = await errorFrom(refreshSession(STORED, NOW))

    expect(error.message).not.toContain('leaky')
    expect(error.message).not.toContain('fake-remember-me-0001')
  })
})

describe('readSignInReply', () => {
  it("takes the remember-me ticket from the sign-in page's session reply", () => {
    const ticket = readSignInReply(JSON.parse(fixture('session.json')))

    expect(ticket).toBeInstanceOf(Secret)
    expect(ticket?.expose()).toBe('fake-remember-me-0002')
  })

  it('returns null for an error reply or a sign-in still waiting for a 2-step code', () => {
    expect(readSignInReply(JSON.parse(fixture('err-session-expired.json')))).toBeNull()
    expect(
      readSignInReply({
        ticket: null,
        twoFactorAuthenticationTicket: 'pending',
        rememberMeTicket: null,
      }),
    ).toBeNull()
    expect(readSignInReply('not json')).toBeNull()
  })
})
