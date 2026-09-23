import type { AccountSummary } from '@shared/ipc'
import type { AccountStatus } from '@shared/models'
import { platformName } from '@shared/platform'

interface AccountCardProps {
  account: AccountSummary
}

const STATUS: Record<AccountStatus, { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'text-success' },
  needs_reauth: { label: 'Needs reconnecting', className: 'text-warning' },
  error: { label: 'Error', className: 'text-danger' },
  disabled: { label: 'Disabled', className: 'text-fg-subtle' },
}

export function AccountCard({ account }: AccountCardProps) {
  const status = STATUS[account.status]
  const games = account.gameCount

  return (
    <div className="flex items-center justify-between gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-fg-muted">{platformName(account.platform)}</span>
        <span className="font-display text-xl font-semibold">{account.displayName}</span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`text-sm font-semibold ${status.className}`}>{status.label}</span>
        <span className="text-sm text-fg-muted">
          {games.toLocaleString()} {games === 1 ? 'game' : 'games'}
        </span>
      </div>
    </div>
  )
}
