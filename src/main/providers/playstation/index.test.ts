import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type { AccountCredentials } from '@shared/models'
import { Secret } from '@shared/secret'
import { applyMigrations } from '../../store/migrate'
import { addPlatformGames, upsertAccount } from '../../store/sync-store'
import { runSyncPass } from '../../sync/sync-pass'
import { PSN_REDIRECT_URI } from './auth'
import { PlayStationProvider } from './index'

const ACCOUNT_ID = '1234567890123456789'
const NPSSO = new Secret('npsso-1')
const NOW = new Date('2026-09-25T17:00:00.000Z')
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const REFRESH_LIFETIME_S = 863999
const STELLAR_BLADE = 'trophy2/NPWR37356_00'

function fixture(name: string): string {
  return readFileSync(resolve('tests/fixtures/playstation', name), 'utf8')
}

const fetchMock = vi.fn<typeof fetch>()
let now = NOW
let minted = 0
let renewed = 0
let mintedAt = NOW
let npssoRefused = false
let refreshRefused = false
let accessRejected = false
let summaryReply = fixture('trophy-summary.json')
let earnedReply = fixture('user-trophies-ps5.json')

function json(body: string, status = 200): Response {
  return new Response(body, { status })
}

function tokens(access: string, refresh: string, refreshLeftS: number): Response {
  return json(
    JSON.stringify({
      ...JSON.parse(fixture('token.json')),
      access_token: access,
      refresh_token: refresh,
      refresh_token_expires_in: refreshLeftS,
    }),
  )
}

function answerToken(form: URLSearchParams): Response {
  if (form.get('grant_type') === 'authorization_code') {
    minted += 1
    mintedAt = now
    return tokens(`access-minted-${minted}`, `refresh-${minted}`, REFRESH_LIFETIME_S)
  }
  if (refreshRefused) return json(fixture('token-refused.json'), 400)
  renewed += 1
  const left = REFRESH_LIFETIME_S - Math.floor((now.getTime() - mintedAt.getTime()) / 1000)
  return tokens(`access-renewed-${renewed}`, form.get('refresh_token') ?? '', left)
}

function answer(url: URL, init: RequestInit | undefined): Response {
  if (url.pathname.endsWith('/oauth/authorize')) {
    const location = npssoRefused
      ? 'https://my.account.sony.com/sonyacct/signin/'
      : `${PSN_REDIRECT_URI}/?code=code-${minted + 1}&cid=c`
    return new Response(null, { status: 302, headers: { Location: location } })
  }
  if (url.pathname.endsWith('/oauth/token')) return answerToken(init?.body as URLSearchParams)
  if (accessRejected) return json(fixture('error-invalid-token.json'), 401)
  if (url.pathname.endsWith('/trophySummary')) return json(summaryReply)
  if (url.pathname.endsWith('/profiles')) return json(fixture('profile.json'))
  if (url.pathname.endsWith('/users/me/trophyTitles')) return json(fixture('trophy-titles.json'))
  if (
    url.pathname.endsWith('/users/me/npCommunicationIds/NPWR37356_00/trophyGroups/all/trophies')
  ) {
    return json(earnedReply)
  }
  if (url.pathname.endsWith('/npCommunicationIds/NPWR37356_00/trophyGroups/all/trophies')) {
    return json(fixture('title-trophies-ps5.json'))
  }
  throw new Error(`unexpected request to ${url.href}`)
}

beforeEach(() => {
  now = NOW
  minted = 0
  renewed = 0
  mintedAt = NOW
  npssoRefused = false
  refreshRefused = false
  accessRejected = false
  summaryReply = fixture('trophy-summary.json')
  earnedReply = fixture('user-trophies-ps5.json')
  fetchMock.mockImplementation((input, init) =>
    Promise.resolve(answer(new URL(String(input)), init)),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function provider(): PlayStationProvider {
  return new PlayStationProvider({ now: () => now })
}

function stored(secret: Secret | null = NPSSO): AccountCredentials {
  return { platform: 'playstation', externalId: ACCOUNT_ID, secret }
}

function requestsTo(path: string): number {
  return fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith(path)).length
}

function bearerTokens(): string[] {
  return fetchMock.mock.calls.flatMap(([, init]) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? ''
    return auth.startsWith('Bearer ') ? [auth.slice('Bearer '.length)] : []
  })
}

async function errorFrom(request: Promise<unknown>): Promise<ProviderError> {
  const error: unknown = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof ProviderError)) throw new Error(`expected a ProviderError, got ${error}`)
  return error
}

describe('PlayStationProvider', () => {
  it('declares an unofficial, polled source with rarity and a sign-in window', () => {
    expect(provider().capabilities).toEqual({
      localWatch: false,
      polling: true,
      globalRarity: true,
      oauth: true,
      unofficial: true,
    })
  })

  describe('authenticate and validate', () => {
    it('keeps the npsso cookie as the secret, keyed by the PSN account id', async () => {
      const psn = provider()

      const credentials = await psn.authenticate({ kind: 'token', value: NPSSO })

      expect(credentials).toEqual({
        platform: 'playstation',
        externalId: ACCOUNT_ID,
        secret: NPSSO,
      })
      expect(await psn.validate(credentials)).toEqual({
        externalId: ACCOUNT_ID,
        displayName: 'ExamplePlayer',
      })
      expect(minted).toBe(1)
    })

    it('refuses any other kind of sign-in', async () => {
      const error = await errorFrom(
        provider().authenticate({ kind: 'api_key', key: new Secret('k'), accountId: '1' }),
      )

      expect(error.kind).toBe('unsupported')
    })

    it('names the account "PlayStation account" when PSN gives no online id', async () => {
      const psn = provider()
      fetchMock.mockImplementation((input, init) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/profiles')) return Promise.resolve(json('{}'))
        return Promise.resolve(answer(url, init))
      })

      const credentials = await psn.authenticate({ kind: 'token', value: NPSSO })

      expect((await psn.validate(credentials)).displayName).toBe('PlayStation account')
    })

    it('reports an npsso Sony refuses as expired', async () => {
      npssoRefused = true

      const error = await errorFrom(provider().authenticate({ kind: 'token', value: NPSSO }))

      expect(error.kind).toBe('auth_expired')
    })
  })

  describe('refresh', () => {
    it('mints tokens from the stored npsso after a restart and hands back the same secret', async () => {
      const credentials = stored()

      expect(await provider().refresh(credentials)).toBe(credentials)
      expect(minted).toBe(1)
      expect(requestsTo('/trophySummary')).toBe(1)
    })

    it('keeps the access token until 10 minutes before it expires, then renews it with the refresh token', async () => {
      const psn = provider()
      await psn.refresh(stored())

      now = new Date(NOW.getTime() + 49 * MINUTE)
      await psn.refresh(stored())
      expect(renewed).toBe(0)

      now = new Date(NOW.getTime() + 51 * MINUTE)
      await psn.refresh(stored())
      expect(renewed).toBe(1)
      expect(minted).toBe(1)
    })

    it('mints a new refresh token from the npsso when the old one has less than a day left', async () => {
      const psn = provider()
      await psn.refresh(stored())

      now = new Date(NOW.getTime() + 9 * DAY + 60 * MINUTE)
      await psn.refresh(stored())

      expect(minted).toBe(2)
      expect(renewed).toBe(0)
    })

    it('falls back to the npsso when Sony refuses the refresh token', async () => {
      const psn = provider()
      await psn.refresh(stored())
      refreshRefused = true

      now = new Date(NOW.getTime() + 2 * 60 * MINUTE)
      await psn.refresh(stored())

      expect(minted).toBe(2)
    })

    it('reports an npsso Sony no longer accepts as expired', async () => {
      npssoRefused = true

      expect((await errorFrom(provider().refresh(stored()))).kind).toBe('auth_expired')
    })

    it('asks Sony only once when asked twice at the same time', async () => {
      const psn = provider()

      await Promise.all([psn.refresh(stored()), psn.refresh(stored())])

      expect(minted).toBe(1)
    })

    it('refuses a saved sign-in that belongs to another PSN account', async () => {
      summaryReply = JSON.stringify({ ...JSON.parse(summaryReply), accountId: '99' })

      expect((await errorFrom(provider().refresh(stored()))).kind).toBe('other')
    })

    it('reports an account with no stored sign-in as expired', async () => {
      expect((await errorFrom(provider().refresh(stored(null)))).kind).toBe('auth_expired')
    })
  })

  describe('listGames', () => {
    it('lists every trophy list with the access token', async () => {
      const psn = provider()
      await psn.refresh(stored())

      const games = await psn.listGames(stored())

      expect(games).toHaveLength(9)
      expect(bearerTokens().at(-1)).toBe('access-minted-1')
    })

    it('never renews the token itself, and asks to retry until refresh has run', async () => {
      const error = await errorFrom(provider().listGames(stored()))

      expect(error.isRetryable).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('drops a token PSN rejects and asks to retry; the next refresh renews it', async () => {
      const psn = provider()
      await psn.refresh(stored())
      accessRejected = true

      const error = await errorFrom(psn.listGames(stored()))
      expect(error.isRetryable).toBe(true)

      accessRejected = false
      await psn.refresh(stored())
      expect(renewed).toBe(1)
      await psn.listGames(stored())
      expect(bearerTokens().at(-1)).toBe('access-renewed-1')
    })
  })

  describe('fetchGame', () => {
    it('reads a PS5 trophy list from the trophy2 service', async () => {
      const psn = provider()
      await psn.refresh(stored())

      const game = await psn.fetchGame(stored(), { externalId: STELLAR_BLADE })

      expect(game.achievements).toHaveLength(45)
      expect(game.unlocks).toHaveLength(39)
      expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('npServiceName=trophy2')
    })

    it('refuses a game id that is not a trophy list', async () => {
      const psn = provider()
      await psn.refresh(stored())

      expect((await errorFrom(psn.fetchGame(stored(), { externalId: '42' }))).kind).toBe('other')
    })
  })

  it('keeps a first sync silent, then announces a new unlock once (baseline rule)', async () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const psn = provider()
    await psn.refresh(stored())
    const account = upsertAccount(db, {
      platform: 'playstation',
      externalId: ACCOUNT_ID,
      displayName: 'ExamplePlayer',
    })
    addPlatformGames(db, account, await psn.listGames(stored()))

    expect(await runSyncPass(db, account, STELLAR_BLADE, psn, stored())).toEqual([])

    const earned = JSON.parse(earnedReply) as {
      trophies: { trophyId: number; earned: boolean; earnedDateTime?: string }[]
    }
    const locked = earned.trophies.find((trophy) => !trophy.earned)
    if (!locked) throw new Error('fixture has no unearned trophy')
    locked.earned = true
    locked.earnedDateTime = '2026-09-25T17:30:00Z'
    earnedReply = JSON.stringify(earned)

    const events = await runSyncPass(db, account, STELLAR_BLADE, psn, stored())
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'playstation',
      gameTitle: 'Stellar Blade',
      unlockedAt: new Date('2026-09-25T17:30:00Z'),
      achievement: { externalId: String(locked.trophyId) },
    })
    expect(await runSyncPass(db, account, STELLAR_BLADE, psn, stored())).toEqual([])
  })
})
