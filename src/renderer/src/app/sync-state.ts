import type { AccountSummary } from '@shared/ipc'

export type SyncState =
  | { readonly kind: 'no_accounts' }
  | { readonly kind: 'syncing' }
  | { readonly kind: 'attention' }
  | { readonly kind: 'synced'; readonly at: Date | null }

export function syncState(accounts: readonly AccountSummary[]): SyncState {
  if (accounts.length === 0) return { kind: 'no_accounts' }
  if (accounts.some((account) => account.syncing)) return { kind: 'syncing' }
  if (accounts.some((account) => account.status === 'needs_reauth' || account.status === 'error')) {
    return { kind: 'attention' }
  }
  return { kind: 'synced', at: latest(accounts.map((account) => account.lastSyncAt)) }
}

function latest(dates: readonly (Date | null)[]): Date | null {
  return dates.reduce<Date | null>(
    (newest, date) => (date && (!newest || date > newest) ? date : newest),
    null,
  )
}
