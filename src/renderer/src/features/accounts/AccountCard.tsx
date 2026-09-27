import { useState } from 'react'
import { Button } from '@/components/Button'
import { formatUnlockDate, plural } from '@/lib/format'
import { completionPercent } from '@shared/dashboard'
import type { AccountSummary } from '@shared/ipc'
import type { AccountStatus } from '@shared/models'
import { platformName } from '@shared/platform'

interface AccountCardProps {
  account: AccountSummary
  onChanged?: () => void
}

const STATUS: Record<AccountStatus, { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'text-success' },
  needs_reauth: { label: 'Needs reconnecting', className: 'text-warning' },
  error: { label: 'Error', className: 'text-danger' },
  disabled: { label: 'Disconnected', className: 'text-fg-subtle' },
}

export function AccountCard({ account, onChanged }: AccountCardProps) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = STATUS[account.status]
  const connected = account.status === 'connected'

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
      onChanged?.()
    } catch {
      setError('Something went wrong. Try again.')
    }
  }

  const disconnect = (keepData: boolean) =>
    run(async () => {
      await window.api.disconnectAccount({ accountId: account.id, keepData })
      setConfirming(false)
    })

  return (
    <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-muted">{platformName(account.platform)}</span>
          <span className="font-display text-xl font-semibold">{account.displayName}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-sm font-semibold ${status.className}`}>{status.label}</span>
          <span className="text-sm text-fg-muted">{plural(account.gameCount, 'game')}</span>
        </div>
      </div>

      <SyncLine account={account} />

      <div className="flex flex-wrap items-center gap-3">
        {connected && (
          <Button
            variant="secondary"
            disabled={account.syncing}
            onClick={() =>
              void run(() => window.api.syncNow({ kind: 'account', accountId: account.id }))
            }
          >
            {account.syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        )}
        {!confirming && (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            {account.status === 'disabled' ? 'Remove…' : 'Disconnect…'}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {confirming && (
        <div
          role="group"
          aria-label={`Disconnect ${account.displayName}`}
          className="flex flex-col gap-3 rounded-card border border-line bg-surface-2 p-4"
        >
          <p className="text-sm">
            {account.status === 'disabled'
              ? 'Remove this account, with its games and achievements, from your library?'
              : 'Trophy Locker stops syncing this account and forgets its sign-in. Keep its games and achievements in your library, or remove them too?'}
          </p>
          <div className="flex flex-wrap gap-3">
            {account.status !== 'disabled' && (
              <Button onClick={() => void disconnect(true)}>Keep its games</Button>
            )}
            <Button variant="secondary" onClick={() => void disconnect(false)}>
              Remove its games
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SyncLine({ account }: { account: AccountSummary }) {
  const name = platformName(account.platform)

  if (account.status === 'needs_reauth') {
    return (
      <p className="text-sm text-warning">
        {name} signed this account out. Connect it again with the {name} card above to keep syncing;
        nothing is lost.
      </p>
    )
  }
  if (account.status === 'disabled') {
    return (
      <p className="text-sm text-fg-muted">
        Not syncing. Its games stay in your library. Connect it again with the {name} card above to
        pick up where it left off.
      </p>
    )
  }
  if (account.syncing && account.checkedGames < account.gameCount) {
    const percent = completionPercent(account.checkedGames, account.gameCount)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">
          Syncing… {account.checkedGames.toLocaleString()} of {plural(account.gameCount, 'game')}{' '}
          read
        </p>
        <div
          role="progressbar"
          aria-label={`${name} sync progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 overflow-hidden rounded-full bg-surface-3"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }
  if (account.syncing) {
    return <p className="text-sm text-fg-muted">Syncing…</p>
  }
  return (
    <p className="text-sm text-fg-muted">
      {account.lastSyncAt
        ? `Last synced: ${formatUnlockDate(account.lastSyncAt)}`
        : 'Not synced yet'}
    </p>
  )
}
