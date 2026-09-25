import type { DatabaseSync } from 'node:sqlite'
import { ProviderError } from '@shared/errors'
import type {
  AccountSummary,
  ConnectFailure,
  ConnectResult,
  EpicConnectInput,
  SteamConnectInput,
} from '@shared/ipc'
import type { AccountCredentials } from '@shared/models'
import type { AchievementProvider } from '@shared/provider'
import { Secret } from '@shared/secret'
import type { SecretStore } from '@shared/secret-store'
import { readAuthorizationCode } from './providers/epic/auth'
import { familySteamId, withFamily } from './providers/steam/family'
import { getAccount, listAccountSummaries, upsertAccount } from './store/sync-store'
import type { Scheduler } from './sync/scheduler'
import { SignInError, type SignInFailure } from './sign-in-error'
import type { MicrosoftAuthorization } from './xbox-sign-in'

export interface AccountsDeps {
  readonly db: DatabaseSync
  readonly steam: AchievementProvider
  readonly secrets: SecretStore
  readonly scheduler: Pick<Scheduler, 'startAccount'>
}

export async function connectSteam(
  deps: AccountsDeps,
  input: SteamConnectInput,
): Promise<ConnectResult> {
  try {
    const credentials = await deps.steam.authenticate({
      kind: 'api_key',
      key: new Secret(input.apiKey),
      accountId: input.steamId,
    })
    const profile = await deps.steam.validate(credentials)
    return { ok: true, account: saveAccount(deps, credentials, profile.displayName) }
  } catch (err) {
    return toFailure(err)
  }
}

export interface XboxAccountsDeps {
  readonly db: DatabaseSync
  readonly xbox: AchievementProvider
  readonly signIn: () => Promise<MicrosoftAuthorization>
  readonly secrets: SecretStore
  readonly scheduler: Pick<Scheduler, 'startAccount'>
}

export async function connectXbox(deps: XboxAccountsDeps): Promise<ConnectResult> {
  try {
    const authorization = await deps.signIn()
    const credentials = await deps.xbox.authenticate({ kind: 'oauth_code', ...authorization })
    const profile = await deps.xbox.validate(credentials)
    return { ok: true, account: saveAccount(deps, credentials, profile.displayName) }
  } catch (err) {
    return toXboxFailure(err)
  }
}

export interface EpicAccountsDeps {
  readonly db: DatabaseSync
  readonly epic: AchievementProvider
  readonly secrets: SecretStore
  readonly scheduler: Pick<Scheduler, 'startAccount'>
}

export async function connectEpic(
  deps: EpicAccountsDeps,
  input: EpicConnectInput,
): Promise<ConnectResult> {
  const code = readAuthorizationCode(input.code)
  if (code === null) {
    return failure(
      'invalid_input',
      "That doesn't look like Epic's code. Copy the 32-character authorizationCode from the Epic page, or the whole page, and paste it here.",
    )
  }
  try {
    const credentials = await deps.epic.authenticate({ kind: 'token', value: new Secret(code) })
    const profile = await deps.epic.validate(credentials)
    return { ok: true, account: saveAccount(deps, credentials, profile.displayName) }
  } catch (err) {
    return toEpicFailure(err)
  }
}

export interface UbisoftAccountsDeps {
  readonly db: DatabaseSync
  readonly ubisoft: AchievementProvider
  readonly signIn: () => Promise<Secret>
  readonly secrets: SecretStore
  readonly scheduler: Pick<Scheduler, 'startAccount'>
}

export async function connectUbisoft(deps: UbisoftAccountsDeps): Promise<ConnectResult> {
  try {
    const rememberMeTicket = await deps.signIn()
    const credentials = await deps.ubisoft.authenticate({ kind: 'token', value: rememberMeTicket })
    const profile = await deps.ubisoft.validate(credentials)
    return { ok: true, account: saveAccount(deps, credentials, profile.displayName) }
  } catch (err) {
    return toUbisoftFailure(err)
  }
}

export interface EaAccountsDeps {
  readonly db: DatabaseSync
  readonly ea: AchievementProvider
  readonly signIn: () => Promise<Secret>
  readonly secrets: SecretStore
  readonly scheduler: Pick<Scheduler, 'startAccount'>
}

export async function connectEa(deps: EaAccountsDeps): Promise<ConnectResult> {
  try {
    const cookies = await deps.signIn()
    const credentials = await deps.ea.authenticate({ kind: 'token', value: cookies })
    const profile = await deps.ea.validate(credentials)
    return { ok: true, account: saveAccount(deps, credentials, profile.displayName) }
  } catch (err) {
    return toEaFailure(err)
  }
}

export interface SteamFamilyDeps {
  readonly db: DatabaseSync
  readonly signIn: () => Promise<Secret>
  readonly checkSignIn: (family: Secret) => Promise<unknown>
  readonly secrets: SecretStore
  readonly scheduler: Pick<Scheduler, 'lookForGamesNow'>
}

export async function connectSteamFamily(deps: SteamFamilyDeps): Promise<ConnectResult> {
  const steamAccounts = listAccountSummaries(deps.db).filter((row) => row.platform === 'steam')
  if (steamAccounts.length === 0) {
    return failure('other', 'Connect your Steam account first, then add its family library.')
  }
  try {
    const family = await deps.signIn()
    const steamId = familySteamId(family)
    const summary = steamAccounts.find((row) => getAccount(deps.db, row.id).externalId === steamId)
    if (!summary) {
      return failure(
        'other',
        'That Steam sign-in is for a different account from the one connected here. Sign in with the connected account.',
      )
    }
    const stored = deps.secrets.find(String(summary.id))
    if (!stored) {
      return failure(
        'other',
        'Connect your Steam account again first, then add its family library.',
      )
    }
    await deps.checkSignIn(family)
    deps.secrets.save(String(summary.id), withFamily(stored, family))
    deps.scheduler.lookForGamesNow(summary.id)
    return { ok: true, account: summary }
  } catch (err) {
    return toSteamFamilyFailure(err)
  }
}

function saveAccount(
  deps: Pick<AccountsDeps, 'db' | 'secrets' | 'scheduler'>,
  credentials: AccountCredentials,
  displayName: string,
): AccountSummary {
  const account = upsertAccount(deps.db, {
    platform: credentials.platform,
    externalId: credentials.externalId,
    displayName,
  })
  if (credentials.secret) deps.secrets.save(String(account.id), credentials.secret)
  deps.scheduler.startAccount(account.id)

  const summary = listAccountSummaries(deps.db).find((row) => row.id === account.id)
  if (!summary) throw new Error(`Account ${account.id} vanished after saving`)
  return summary
}

const SIGN_IN_MESSAGES: Record<SignInFailure, (service: string) => string> = {
  cancelled: (service) => `The ${service} sign-in was cancelled.`,
  timed_out: (service) => `The ${service} sign-in timed out. Please try again.`,
  denied: (service) => `The ${service} sign-in was not completed. Please try again.`,
}

function toXboxFailure(err: unknown): ConnectResult {
  if (err instanceof SignInError) {
    return failure('cancelled', SIGN_IN_MESSAGES[err.reason]('Microsoft'))
  }
  if (err instanceof ProviderError) {
    if (err.isRetryable) {
      return failure('network', "Couldn't reach Xbox Live. Check your connection and try again.")
    }
    return failure('other', err.message)
  }
  console.error('Connecting an Xbox account failed', err)
  return failure('other', 'Something went wrong while connecting. Please try again.')
}

function toEpicFailure(err: unknown): ConnectResult {
  if (err instanceof ProviderError) {
    if (err.kind === 'auth_expired') {
      return failure(
        'code_rejected',
        'Epic did not accept that code. Codes only last a few minutes: open the Epic page again, copy the new code and paste it straight away.',
      )
    }
    if (err.isRetryable) {
      return failure('network', "Couldn't reach Epic. Check your connection and try again.")
    }
    return failure('other', err.message)
  }
  console.error('Connecting an Epic account failed', err)
  return failure('other', 'Something went wrong while connecting. Please try again.')
}

function toUbisoftFailure(err: unknown): ConnectResult {
  if (err instanceof SignInError) {
    return failure('cancelled', SIGN_IN_MESSAGES[err.reason]('Ubisoft'))
  }
  if (err instanceof ProviderError) {
    if (err.kind === 'auth_expired') {
      return failure('other', 'Ubisoft did not accept the sign-in. Please sign in again.')
    }
    if (err.isRetryable) {
      return failure('network', "Couldn't reach Ubisoft. Check your connection and try again.")
    }
    return failure('other', err.message)
  }
  console.error('Connecting a Ubisoft account failed', err)
  return failure('other', 'Something went wrong while connecting. Please try again.')
}
function toSteamFamilyFailure(err: unknown): ConnectResult {
  if (err instanceof SignInError) {
    return failure('cancelled', SIGN_IN_MESSAGES[err.reason]('Steam'))
  }
  if (err instanceof ProviderError) {
    if (err.kind === 'auth_expired') {
      return failure('other', 'Steam did not accept the sign-in. Please sign in again.')
    }
    if (err.isRetryable) {
      return failure('network', "Couldn't reach Steam. Check your connection and try again.")
    }
    return failure('other', err.message)
  }
  console.error('Adding a Steam family library failed', err)
  return failure('other', 'Something went wrong while connecting. Please try again.')
}

function toEaFailure(err: unknown): ConnectResult {
  if (err instanceof SignInError) {
    return failure('cancelled', SIGN_IN_MESSAGES[err.reason]('EA'))
  }
  if (err instanceof ProviderError) {
    if (err.kind === 'auth_expired') {
      return failure('other', 'EA did not accept the sign-in. Please sign in again.')
    }
    if (err.isRetryable) {
      return failure('network', "Couldn't reach EA. Check your connection and try again.")
    }
    return failure('other', err.message)
  }
  console.error('Connecting an EA account failed', err)
  return failure('other', 'Something went wrong while connecting. Please try again.')
}

function toFailure(err: unknown): ConnectResult {
  if (err instanceof ProviderError) {
    if (err.kind === 'auth_expired') {
      return failure('key_rejected', 'Steam rejected that API key. Check it and try again.')
    }
    if (err.isRetryable) {
      return failure('network', "Couldn't reach Steam. Check your connection and try again.")
    }
    return failure('other', err.message)
  }
  console.error('Connecting a Steam account failed', err)
  return failure('other', 'Something went wrong while connecting. Please try again.')
}

function failure(reason: ConnectFailure, message: string): ConnectResult {
  return { ok: false, reason, message }
}
