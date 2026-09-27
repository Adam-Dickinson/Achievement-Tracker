import type { DatabaseSync } from 'node:sqlite'
import type { DisconnectInput, SyncScope } from '@shared/ipc'
import type { SecretStore } from '@shared/secret-store'
import { deleteAccountData, listConnectedEntries, setAccountStatus } from './store/sync-store'
import type { Scheduler } from './sync/scheduler'

export interface SyncControlDeps {
  readonly db: DatabaseSync
  readonly secrets: SecretStore
  readonly scheduler: Pick<
    Scheduler,
    'syncAllNow' | 'syncAccountNow' | 'syncGameNow' | 'stopAccount'
  >
}

export async function syncNow(deps: SyncControlDeps, scope: SyncScope): Promise<void> {
  switch (scope.kind) {
    case 'all':
      deps.scheduler.syncAllNow()
      return
    case 'account':
      deps.scheduler.syncAccountNow(scope.accountId)
      return
    case 'game':
      await Promise.all(
        listConnectedEntries(deps.db, scope.gameId).map((entry) =>
          deps.scheduler.syncGameNow(entry.accountId, entry.externalId, true),
        ),
      )
  }
}

export function disconnectAccount(deps: SyncControlDeps, input: DisconnectInput): void {
  deps.scheduler.stopAccount(input.accountId)
  deps.secrets.delete(String(input.accountId))
  if (input.keepData) setAccountStatus(deps.db, input.accountId, 'disabled')
  else deleteAccountData(deps.db, input.accountId)
}
