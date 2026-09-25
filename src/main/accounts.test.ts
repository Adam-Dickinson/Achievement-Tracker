import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type { AccountCredentials } from '@shared/models'
import type { AchievementProvider } from '@shared/provider'
import { Secret } from '@shared/secret'
import { InMemorySecretStore, type SecretStore } from '@shared/secret-store'
import {
  connectEa,
  connectEpic,
  connectSteam,
  connectUbisoft,
  connectXbox,
  NO_API_KEY_MESSAGE,
  signInToSteam,
} from './accounts'
import { readSteamSecret } from './providers/steam/session'
import { applyMigrations } from './store/migrate'
import { listAccountSummaries, setAccountStatus } from './store/sync-store'
import { SignInError } from './sign-in-error'

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

const EPIC_ACCOUNT = '0123456789abcdef0123456789abcdef'
const EPIC_CODE = 'fedcba9876543210fedcba9876543210'

function fakeEpic(overrides: Partial<AchievementProvider> = {}): AchievementProvider {
  return fakeSteam({
    platform: 'epic',
    authenticate: () =>
      Promise.resolve({
        platform: 'epic',
        externalId: EPIC_ACCOUNT,
        secret: new Secret('refresh'),
      }),
    validate: () => Promise.resolve({ externalId: EPIC_ACCOUNT, displayName: 'EpicPlayer' }),
    ...overrides,
  })
}

function setupEpic(epic = fakeEpic()) {
  const { db, secrets, scheduler } = setup()
  return { db, secrets, scheduler, deps: { db, epic, secrets, scheduler } }
}

describe('connectEpic', () => {
  it('signs in with the code, saves the account and its refresh token, and starts syncing it', async () => {
    const { db, secrets, scheduler, deps } = setupEpic()

    const result = await connectEpic(deps, { code: EPIC_CODE, acceptedUnofficial: true })

    expect(result).toEqual({
      ok: true,
      account: {
        id: 1,
        platform: 'epic',
        displayName: 'EpicPlayer',
        status: 'connected',
        gameCount: 0,
      },
    })
    expect(listAccountSummaries(db)).toHaveLength(1)
    expect(secrets.find('1')?.expose()).toBe('refresh')
    expect(scheduler.startAccount).toHaveBeenCalledWith(1)
  })

  it('hands the provider the code alone, even when the whole Epic page was pasted', async () => {
    const authenticate = vi.fn<AchievementProvider['authenticate']>(() =>
      Promise.resolve({ platform: 'epic', externalId: EPIC_ACCOUNT, secret: new Secret('t') }),
    )
    const { deps } = setupEpic(fakeEpic({ authenticate }))
    const page = `{"redirectUrl":"https://localhost/launcher/authorized?code=${EPIC_CODE}","authorizationCode":"${EPIC_CODE}","sid":null}`

    await connectEpic(deps, { code: page, acceptedUnofficial: true })

    const input = authenticate.mock.calls[0]?.[0]
    expect(input?.kind === 'token' && input.value.expose()).toBe(EPIC_CODE)
  })

  it('says what to paste when there is no code in the text, without calling Epic', async () => {
    const authenticate = vi.fn<AchievementProvider['authenticate']>()
    const { deps } = setupEpic(fakeEpic({ authenticate }))

    const result = await connectEpic(deps, { code: 'hello', acceptedUnofficial: true })

    expect(result).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('explains that codes expire when Epic rejects one, and saves nothing', async () => {
    const { db, deps } = setupEpic(
      fakeEpic({
        authenticate: () =>
          Promise.reject(
            new ProviderError(
              'auth_expired',
              'Epic: that sign-in code has expired or was already used',
            ),
          ),
      }),
    )

    const result = await connectEpic(deps, { code: EPIC_CODE, acceptedUnofficial: true })

    expect(result).toMatchObject({ ok: false, reason: 'code_rejected' })
    expect(result.ok || result.message).toMatch(/Codes only last a few minutes/)
    expect(listAccountSummaries(db)).toEqual([])
  })

  it('reports a network failure as a connection problem', async () => {
    const { deps } = setupEpic(
      fakeEpic({
        authenticate: () => Promise.reject(new ProviderError('network', 'Epic: could not reach')),
      }),
    )

    expect(await connectEpic(deps, { code: EPIC_CODE, acceptedUnofficial: true })).toEqual({
      ok: false,
      reason: 'network',
      message: "Couldn't reach Epic. Check your connection and try again.",
    })
  })

  it("passes on the provider's own message for any other refusal", async () => {
    const message = 'Epic: unexpected reply from the sign-in (HTTP 403)'
    const { deps } = setupEpic(
      fakeEpic({ authenticate: () => Promise.reject(new ProviderError('other', message)) }),
    )

    expect(await connectEpic(deps, { code: EPIC_CODE, acceptedUnofficial: true })).toEqual({
      ok: false,
      reason: 'other',
      message,
    })
  })

  it('reports an unexpected failure with a general message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { deps } = setupEpic(fakeEpic({ validate: () => Promise.reject(new Error('boom')) }))

    const result = await connectEpic(deps, { code: EPIC_CODE, acceptedUnofficial: true })

    expect(result).toMatchObject({ ok: false, reason: 'other' })
    expect(result.ok || result.message).not.toContain('boom')
    vi.restoreAllMocks()
  })
})

const UBISOFT_USER = '00000000-0000-4000-8000-0000000000aa'

function fakeUbisoft(overrides: Partial<AchievementProvider> = {}): AchievementProvider {
  return fakeSteam({
    platform: 'ubisoft',
    authenticate: () =>
      Promise.resolve({
        platform: 'ubisoft',
        externalId: UBISOFT_USER,
        secret: new Secret('rotated-remember-me'),
      }),
    validate: () => Promise.resolve({ externalId: UBISOFT_USER, displayName: 'TestPlayer' }),
    ...overrides,
  })
}

function setupUbisoft(
  ubisoft = fakeUbisoft(),
  signIn: () => Promise<Secret> = () => Promise.resolve(new Secret('from-sign-in-window')),
) {
  const { db, secrets, scheduler } = setup()
  return { db, secrets, scheduler, deps: { db, ubisoft, signIn, secrets, scheduler } }
}

describe('connectUbisoft', () => {
  it('signs in, saves the account and its rotated remember-me ticket, and starts syncing it', async () => {
    const { db, secrets, scheduler, deps } = setupUbisoft()

    const result = await connectUbisoft(deps)

    expect(result).toEqual({
      ok: true,
      account: {
        id: 1,
        platform: 'ubisoft',
        displayName: 'TestPlayer',
        status: 'connected',
        gameCount: 0,
      },
    })
    expect(listAccountSummaries(db)).toHaveLength(1)
    expect(secrets.find('1')?.expose()).toBe('rotated-remember-me')
    expect(scheduler.startAccount).toHaveBeenCalledWith(1)
  })

  it("hands the provider the sign-in window's ticket as a token", async () => {
    const authenticate = vi.fn<AchievementProvider['authenticate']>(() =>
      Promise.resolve({ platform: 'ubisoft', externalId: UBISOFT_USER, secret: new Secret('t') }),
    )
    const { deps } = setupUbisoft(fakeUbisoft({ authenticate }))

    await connectUbisoft(deps)

    const [input] = authenticate.mock.calls[0] ?? []
    expect(input?.kind).toBe('token')
    expect(input?.kind === 'token' && input.value.expose()).toBe('from-sign-in-window')
  })

  it.each([
    ['cancelled', 'The Ubisoft sign-in was cancelled.'],
    ['timed_out', 'The Ubisoft sign-in timed out. Please try again.'],
  ] as const)('reports a %s sign-in as cancelled, and saves nothing', async (reason, message) => {
    const { db, scheduler, deps } = setupUbisoft(fakeUbisoft(), () =>
      Promise.reject(new SignInError(reason, 'x')),
    )

    expect(await connectUbisoft(deps)).toEqual({ ok: false, reason: 'cancelled', message })
    expect(listAccountSummaries(db)).toEqual([])
    expect(scheduler.startAccount).not.toHaveBeenCalled()
  })

  it('asks to sign in again when Ubisoft rejects the fresh ticket', async () => {
    const { secrets, deps } = setupUbisoft(
      fakeUbisoft({
        authenticate: () =>
          Promise.reject(new ProviderError('auth_expired', 'Ubisoft: the sign-in has expired')),
      }),
    )

    expect(await connectUbisoft(deps)).toEqual({
      ok: false,
      reason: 'other',
      message: 'Ubisoft did not accept the sign-in. Please sign in again.',
    })
    expect(secrets.find('1')).toBeUndefined()
  })

  it('reports a network failure as a connection problem', async () => {
    const { deps } = setupUbisoft(
      fakeUbisoft({
        authenticate: () =>
          Promise.reject(new ProviderError('network', 'Ubisoft: could not reach')),
      }),
    )

    expect(await connectUbisoft(deps)).toMatchObject({ ok: false, reason: 'network' })
  })

  it("passes on the provider's own message for any other refusal", async () => {
    const message = 'Ubisoft: unexpected reply from the sign-in (HTTP 400)'
    const { deps } = setupUbisoft(
      fakeUbisoft({ authenticate: () => Promise.reject(new ProviderError('other', message)) }),
    )

    expect(await connectUbisoft(deps)).toEqual({ ok: false, reason: 'other', message })
  })

  it('reports an unexpected failure with a general message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { deps } = setupUbisoft(fakeUbisoft(), () => Promise.reject(new Error('window crashed')))

    const result = await connectUbisoft(deps)

    expect(result).toMatchObject({ ok: false, reason: 'other' })
    expect(result.ok || result.message).not.toContain('crashed')
    vi.restoreAllMocks()
  })
})

const EA_ACCOUNT = '1000000000001'

function fakeEa(overrides: Partial<AchievementProvider> = {}): AchievementProvider {
  return fakeSteam({
    platform: 'ea',
    authenticate: () =>
      Promise.resolve({
        platform: 'ea',
        externalId: EA_ACCOUNT,
        secret: new Secret('rotated-cookies'),
      }),
    validate: () => Promise.resolve({ externalId: EA_ACCOUNT, displayName: 'TestPlayer' }),
    ...overrides,
  })
}

function setupEa(
  ea = fakeEa(),
  signIn: () => Promise<Secret> = () => Promise.resolve(new Secret('from-sign-in-window')),
) {
  const { db, secrets, scheduler } = setup()
  return { db, secrets, scheduler, deps: { db, ea, signIn, secrets, scheduler } }
}

describe('connectEa', () => {
  it('signs in, saves the account and its rotated sign-in cookies, and starts syncing it', async () => {
    const { db, secrets, scheduler, deps } = setupEa()

    const result = await connectEa(deps)

    expect(result).toEqual({
      ok: true,
      account: {
        id: 1,
        platform: 'ea',
        displayName: 'TestPlayer',
        status: 'connected',
        gameCount: 0,
      },
    })
    expect(listAccountSummaries(db)).toHaveLength(1)
    expect(secrets.find('1')?.expose()).toBe('rotated-cookies')
    expect(scheduler.startAccount).toHaveBeenCalledWith(1)
  })

  it("hands the provider the sign-in window's cookies as a token", async () => {
    const authenticate = vi.fn<AchievementProvider['authenticate']>(() =>
      Promise.resolve({ platform: 'ea', externalId: EA_ACCOUNT, secret: new Secret('t') }),
    )
    const { deps } = setupEa(fakeEa({ authenticate }))

    await connectEa(deps)

    const [input] = authenticate.mock.calls[0] ?? []
    expect(input?.kind).toBe('token')
    expect(input?.kind === 'token' && input.value.expose()).toBe('from-sign-in-window')
  })

  it.each([
    ['cancelled', 'The EA sign-in was cancelled.'],
    ['timed_out', 'The EA sign-in timed out. Please try again.'],
  ] as const)('reports a %s sign-in as cancelled, and saves nothing', async (reason, message) => {
    const { db, scheduler, deps } = setupEa(fakeEa(), () =>
      Promise.reject(new SignInError(reason, 'x')),
    )

    expect(await connectEa(deps)).toEqual({ ok: false, reason: 'cancelled', message })
    expect(listAccountSummaries(db)).toEqual([])
    expect(scheduler.startAccount).not.toHaveBeenCalled()
  })

  it('asks to sign in again when EA rejects the fresh cookies', async () => {
    const { secrets, deps } = setupEa(
      fakeEa({
        authenticate: () =>
          Promise.reject(new ProviderError('auth_expired', 'EA: the sign-in has expired')),
      }),
    )

    expect(await connectEa(deps)).toEqual({
      ok: false,
      reason: 'other',
      message: 'EA did not accept the sign-in. Please sign in again.',
    })
    expect(secrets.find('1')).toBeUndefined()
  })

  it('reports a network failure as a connection problem', async () => {
    const { deps } = setupEa(
      fakeEa({
        authenticate: () => Promise.reject(new ProviderError('network', 'EA: could not reach')),
      }),
    )

    expect(await connectEa(deps)).toMatchObject({ ok: false, reason: 'network' })
  })

  it("passes on the provider's own message for any other refusal", async () => {
    const message = 'EA: unexpected reply from the sign-in (HTTP 400)'
    const { deps } = setupEa(
      fakeEa({ authenticate: () => Promise.reject(new ProviderError('other', message)) }),
    )

    expect(await connectEa(deps)).toEqual({ ok: false, reason: 'other', message })
  })

  it('reports an unexpected failure with a general message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { deps } = setupEa(fakeEa(), () => Promise.reject(new Error('window crashed')))

    const result = await connectEa(deps)

    expect(result).toMatchObject({ ok: false, reason: 'other' })
    expect(result.ok || result.message).not.toContain('crashed')
    vi.restoreAllMocks()
  })
})

const SIGNED_IN_STEAM_ID = '76561190000000001'
const SIGNED_IN_KEY = '0123456789ABCDEF0123456789ABCDEF'
const STEAM_SIGN_IN = new Secret(`${SIGNED_IN_STEAM_ID}%7C%7Cfake.refresh.token`)

function setupSteamSignIn(
  overrides: {
    signIn?: () => Promise<Secret>
    readApiKey?: (signIn: Secret) => Promise<Secret | null>
    steam?: AchievementProvider
  } = {},
) {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  const secrets = new InMemorySecretStore()
  const scheduler = {
    startAccount: vi.fn<(accountId: number) => void>(),
    lookForGamesNow: vi.fn<(accountId: number) => void>(),
  }
  const readApiKey = vi.fn(
    overrides.readApiKey ?? (() => Promise.resolve<Secret | null>(new Secret(SIGNED_IN_KEY))),
  )
  const authenticate = vi.fn<AchievementProvider['authenticate']>((input) =>
    Promise.resolve({
      platform: 'steam',
      externalId: input.kind === 'api_key' ? input.accountId : '',
      secret: input.kind === 'api_key' ? input.key : null,
    }),
  )
  const steam = overrides.steam ?? fakeSteam({ authenticate })
  const deps = {
    db,
    steam,
    signIn: overrides.signIn ?? (() => Promise.resolve(STEAM_SIGN_IN)),
    readApiKey,
    secrets,
    scheduler,
  }
  return { db, secrets, scheduler, readApiKey, authenticate, deps }
}

describe('signInToSteam', () => {
  it('connects the signed-in account with the API key read from Steam, keeping the family sign-in', async () => {
    const { secrets, scheduler, readApiKey, authenticate, deps } = setupSteamSignIn()

    const result = await signInToSteam(deps, { includeFamily: true, acceptedUnofficial: true })

    expect(result).toMatchObject({ ok: true, account: { id: 1, platform: 'steam' } })
    expect(readApiKey).toHaveBeenCalledWith(STEAM_SIGN_IN)
    const [input] = authenticate.mock.calls[0] ?? []
    expect(input).toMatchObject({ kind: 'api_key', accountId: SIGNED_IN_STEAM_ID })
    const stored = secrets.find('1')
    expect(stored && readSteamSecret(stored).key.expose()).toBe(SIGNED_IN_KEY)
    expect(stored && readSteamSecret(stored).family?.expose()).toBe(STEAM_SIGN_IN.expose())
    expect(scheduler.lookForGamesNow).toHaveBeenCalledWith(1)
  })

  it('keeps only the API key when the family library is not wanted', async () => {
    const { secrets, deps } = setupSteamSignIn()

    await signInToSteam(deps, { includeFamily: false, acceptedUnofficial: true })

    expect(secrets.find('1')?.expose()).toBe(SIGNED_IN_KEY)
  })

  it('explains how to create a key when the account has none, and saves nothing', async () => {
    const { db, deps } = setupSteamSignIn({ readApiKey: () => Promise.resolve(null) })

    expect(await signInToSteam(deps, { includeFamily: true, acceptedUnofficial: true })).toEqual({
      ok: false,
      reason: 'other',
      message: NO_API_KEY_MESSAGE,
    })
    expect(listAccountSummaries(db)).toEqual([])
  })

  it.each([
    ['cancelled', 'The Steam sign-in was cancelled.'],
    ['timed_out', 'The Steam sign-in timed out. Please try again.'],
  ] as const)('reports a %s sign-in as cancelled', async (reason, message) => {
    const { deps } = setupSteamSignIn({
      signIn: () => Promise.reject(new SignInError(reason, 'x')),
    })

    expect(await signInToSteam(deps, { includeFamily: true, acceptedUnofficial: true })).toEqual({
      ok: false,
      reason: 'cancelled',
      message,
    })
  })

  it('asks to sign in again when Steam will not renew the sign-in', async () => {
    const { deps } = setupSteamSignIn({
      readApiKey: () => Promise.reject(new ProviderError('auth_expired', 'expired')),
    })

    expect(await signInToSteam(deps, { includeFamily: true, acceptedUnofficial: true })).toEqual({
      ok: false,
      reason: 'other',
      message: 'Steam did not accept the sign-in. Please sign in again.',
    })
  })

  it('reports a network failure as a connection problem', async () => {
    const { deps } = setupSteamSignIn({
      readApiKey: () => Promise.reject(new ProviderError('network', 'Steam: could not reach')),
    })

    expect(
      await signInToSteam(deps, { includeFamily: false, acceptedUnofficial: true }),
    ).toMatchObject({
      ok: false,
      reason: 'network',
    })
  })

  it('reports an unexpected failure with a general message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { deps } = setupSteamSignIn({ signIn: () => Promise.reject(new Error('window crashed')) })

    const result = await signInToSteam(deps, { includeFamily: false, acceptedUnofficial: true })

    expect(result).toMatchObject({ ok: false, reason: 'other' })
    expect(result.ok || result.message).not.toContain('window crashed')
    vi.restoreAllMocks()
  })
})
