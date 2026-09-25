import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type { AccountCredentials } from '@shared/models'
import type { AchievementProvider } from '@shared/provider'
import { Secret } from '@shared/secret'
import { InMemorySecretStore, type SecretStore } from '@shared/secret-store'
import { connectSteam, connectXbox } from './accounts'
import { applyMigrations } from './store/migrate'
import { listAccountSummaries, setAccountStatus } from './store/sync-store'
import { SignInError } from './xbox-sign-in'

const STEAM_ID = '76561190000000001'
const KEY = '0123456789ABCDEF0123456789ABCDEF'
const INPUT = { steamId: STEAM_ID, apiKey: KEY }

function fakeSteam(overrides: Partial<AchievementProvider> = {}): AchievementProvider {
  const notUsed = (): never => {
    throw new Error('not used when connecting')
  }
  return {
    platform: 'steam',
    capabilities: {
      localWatch: false,
      polling: true,
      globalRarity: true,
      oauth: false,
      unofficial: false,
    },
    authenticate: (input) =>
      Promise.resolve({
        platform: 'steam',
        externalId: input.kind === 'api_key' ? input.accountId : '',
        secret: input.kind === 'api_key' ? input.key : null,
      }),
    validate: (credentials: AccountCredentials) =>
      Promise.resolve({ externalId: credentials.externalId, displayName: 'Test Player' }),
    listGames: notUsed,
    fetchGame: notUsed,
    ...overrides,
  }
}

function setup(steam = fakeSteam(), secrets: SecretStore = new InMemorySecretStore()) {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  const scheduler = { startAccount: vi.fn<(accountId: number) => void>() }
  return { db, secrets, scheduler, deps: { db, steam, secrets, scheduler } }
}

describe('connectSteam', () => {
  it('saves the account and its key, starts syncing it, and returns its summary', async () => {
    const { db, secrets, scheduler, deps } = setup()

    const result = await connectSteam(deps, INPUT)

    expect(result).toEqual({
      ok: true,
      account: {
        id: 1,
        platform: 'steam',
        displayName: 'Test Player',
        status: 'connected',
        gameCount: 0,
      },
    })
    expect(listAccountSummaries(db)).toHaveLength(1)
    expect(secrets.find('1')?.expose()).toBe(KEY)
    expect(scheduler.startAccount).toHaveBeenCalledWith(1)
  })

  it('passes the SteamID and key to Steam wrapped as a Secret', async () => {
    const authenticate = vi.fn<AchievementProvider['authenticate']>(() =>
      Promise.resolve({ platform: 'steam', externalId: STEAM_ID, secret: new Secret(KEY) }),
    )
    const { deps } = setup(fakeSteam({ authenticate }))

    await connectSteam(deps, INPUT)

    const input = authenticate.mock.calls[0]?.[0]
    expect(input).toMatchObject({ kind: 'api_key', accountId: STEAM_ID })
    expect(input?.kind === 'api_key' && input.key).toBeInstanceOf(Secret)
    expect(input?.kind === 'api_key' && input.key.expose()).toBe(KEY)
  })

  it('reconnecting the same SteamID keeps the same account and replaces its key', async () => {
    const { db, secrets, deps } = setup()
    await connectSteam(deps, INPUT)
    setAccountStatus(db, 1, 'needs_reauth')

    const result = await connectSteam(deps, {
      ...INPUT,
      apiKey: 'FEDCBA9876543210FEDCBA9876543210',
    })

    expect(result.ok && result.account).toMatchObject({ id: 1, status: 'connected' })
    expect(listAccountSummaries(db)).toHaveLength(1)
    expect(secrets.find('1')?.expose()).toBe('FEDCBA9876543210FEDCBA9876543210')
  })

  it('reports a key Steam rejects, and saves nothing', async () => {
    const { db, secrets, scheduler, deps } = setup(
      fakeSteam({
        authenticate: () => Promise.reject(new ProviderError('auth_expired', 'Steam: rejected')),
      }),
    )

    const result = await connectSteam(deps, INPUT)

    expect(result).toMatchObject({ ok: false, reason: 'key_rejected' })
    expect(listAccountSummaries(db)).toEqual([])
    expect(secrets.find('1')).toBeUndefined()
    expect(scheduler.startAccount).not.toHaveBeenCalled()
  })

  it.each([
    ['network', new ProviderError('network', 'Steam: could not reach')],
    ['rate_limited', new ProviderError('rate_limited', 'Steam: too many requests')],
  ])('reports a %s failure as a connection problem', async (_label, error) => {
    const { deps } = setup(fakeSteam({ validate: () => Promise.reject(error) }))

    expect(await connectSteam(deps, INPUT)).toMatchObject({ ok: false, reason: 'network' })
  })

  it('passes on the provider’s own message for other problems, such as a mistyped SteamID', async () => {
    const message = 'Steam: the SteamID should be 17 digits starting 7656119'
    const { deps } = setup(
      fakeSteam({ authenticate: () => Promise.reject(new ProviderError('other', message)) }),
    )

    expect(await connectSteam(deps, INPUT)).toEqual({ ok: false, reason: 'other', message })
  })

  it('reports an unexpected failure with a general message, never the raw error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const secrets = new InMemorySecretStore()
    vi.spyOn(secrets, 'save').mockImplementation(() => {
      throw new Error('Cannot save a secret: OS encryption is not available')
    })
    const { scheduler, deps } = setup(fakeSteam(), secrets)

    const result = await connectSteam(deps, INPUT)

    expect(result).toMatchObject({ ok: false, reason: 'other' })
    expect(result.ok || result.message).not.toContain('encryption')
    expect(scheduler.startAccount).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

const XUID = '2535400000000001'
const AUTHORIZATION = {
  code: 'the-code',
  redirectUri: 'http://localhost:1234',
  codeVerifier: new Secret('the-verifier'),
}

function fakeXbox(overrides: Partial<AchievementProvider> = {}): AchievementProvider {
  return fakeSteam({
    platform: 'xbox',
    authenticate: () =>
      Promise.resolve({ platform: 'xbox', externalId: XUID, secret: new Secret('refresh-token') }),
    validate: () => Promise.resolve({ externalId: XUID, displayName: 'SampleGamer' }),
    ...overrides,
  })
}

function setupXbox(
  xbox = fakeXbox(),
  signIn: () => Promise<typeof AUTHORIZATION> = () => Promise.resolve(AUTHORIZATION),
) {
  const { db, secrets, scheduler } = setup()
  return { db, secrets, scheduler, deps: { db, xbox, signIn, secrets, scheduler } }
}

describe('connectXbox', () => {
  it('signs in, saves the account and its refresh token, and starts syncing it', async () => {
    const { db, secrets, scheduler, deps } = setupXbox()

    const result = await connectXbox(deps)

    expect(result).toEqual({
      ok: true,
      account: {
        id: 1,
        platform: 'xbox',
        displayName: 'SampleGamer',
        status: 'connected',
        gameCount: 0,
      },
    })
    expect(listAccountSummaries(db)).toHaveLength(1)
    expect(secrets.find('1')?.expose()).toBe('refresh-token')
    expect(scheduler.startAccount).toHaveBeenCalledWith(1)
  })

  it('hands the sign-in code, redirect address and verifier to the provider', async () => {
    const authenticate = vi.fn<AchievementProvider['authenticate']>(() =>
      Promise.resolve({ platform: 'xbox', externalId: XUID, secret: new Secret('t') }),
    )
    const { deps } = setupXbox(fakeXbox({ authenticate }))

    await connectXbox(deps)

    expect(authenticate).toHaveBeenCalledWith({ kind: 'oauth_code', ...AUTHORIZATION })
  })

  it('signing in again fixes an account that needed it, keeping the same account', async () => {
    const { db, deps } = setupXbox()
    await connectXbox(deps)
    setAccountStatus(db, 1, 'needs_reauth')

    const result = await connectXbox(deps)

    expect(result.ok && result.account).toMatchObject({ id: 1, status: 'connected' })
    expect(listAccountSummaries(db)).toHaveLength(1)
  })

  it.each([
    ['cancelled', 'The Microsoft sign-in was cancelled.'],
    ['timed_out', 'The Microsoft sign-in timed out. Please try again.'],
    ['denied', 'The Microsoft sign-in was not completed. Please try again.'],
  ] as const)('reports a %s sign-in as cancelled, and saves nothing', async (reason, message) => {
    const { db, scheduler, deps } = setupXbox(fakeXbox(), () =>
      Promise.reject(new SignInError(reason, 'x')),
    )

    expect(await connectXbox(deps)).toEqual({ ok: false, reason: 'cancelled', message })
    expect(listAccountSummaries(db)).toEqual([])
    expect(scheduler.startAccount).not.toHaveBeenCalled()
  })

  it('reports a network failure as a connection problem', async () => {
    const { deps } = setupXbox(
      fakeXbox({
        authenticate: () => Promise.reject(new ProviderError('network', 'Xbox: could not reach')),
      }),
    )

    expect(await connectXbox(deps)).toMatchObject({ ok: false, reason: 'network' })
  })

  it('passes on the provider’s own message, such as an account with no Xbox profile', async () => {
    const message =
      'Xbox: this Microsoft account has no Xbox profile yet. Sign in to Xbox once, then try again'
    const { secrets, deps } = setupXbox(
      fakeXbox({ authenticate: () => Promise.reject(new ProviderError('other', message)) }),
    )

    expect(await connectXbox(deps)).toEqual({ ok: false, reason: 'other', message })
    expect(secrets.find('1')).toBeUndefined()
  })

  it('reports an unexpected failure with a general message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { deps } = setupXbox(fakeXbox(), () => Promise.reject(new Error('port in use')))

    const result = await connectXbox(deps)

    expect(result).toMatchObject({ ok: false, reason: 'other' })
    expect(result.ok || result.message).not.toContain('port')
    vi.restoreAllMocks()
  })
})
