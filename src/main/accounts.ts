import type { DatabaseSync } from 'node:sqlite'
import { ProviderError } from '@shared/errors'
import type { ConnectFailure, ConnectResult, SteamConnectInput } from '@shared/ipc'
import type { AchievementProvider } from '@shared/provider'
import { Secret } from '@shared/secret'
import type { SecretStore } from '@shared/secret-store'
import { listAccountSummaries, upsertAccount } from './store/sync-store'
import type { Scheduler } from './sync/scheduler'

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
    const account = upsertAccount(deps.db, {
      platform: 'steam',
      externalId: credentials.externalId,
      displayName: profile.displayName,
    })
    if (credentials.secret) deps.secrets.save(String(account.id), credentials.secret)
    deps.scheduler.startAccount(account.id)

    const summary = listAccountSummaries(deps.db).find((row) => row.id === account.id)
    if (!summary) throw new Error(`Account ${account.id} vanished after saving`)
    return { ok: true, account: summary }
  } catch (err) {
    return toFailure(err)
  }
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
