import { CircleCheck, CircleX, LogIn, RefreshCw, TriangleAlert, Unplug } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { PlatformTile } from '@/components/PlatformTile'
import { formatAgo, plural } from '@/lib/format'
import { completionPercent } from '@shared/dashboard'
import type { AccountSummary } from '@shared/ipc'
import type { AccountStatus } from '@shared/models'
import { platformName } from '@shared/platform'
import { SourceKind } from './SourceKind'
import { isOnline, SOURCES, sourceName } from './sources'

interface AccountCardProps {
  account: AccountSummary
  onChanged?: () => void
  onReconnect?: () => void
}

const STATUS: Record<AccountStatus, { label: string; icon: ReactNode; className: string }> = {
  connected: {
    label: 'Connected',
    icon: <CircleCheck aria-hidden="true" className="size-3.5" />,
    className: 'bg-success/14 text-success',
  },
  needs_reauth: {
    label: 'Needs signing in',
    icon: <TriangleAlert aria-hidden="true" className="size-3.5" />,
    className: 'bg-warning/14 text-warning',
  },
  error: {
    label: 'Error',
    icon: <CircleX aria-hidden="true" className="size-3.5" />,
    className: 'bg-danger/14 text-danger',
  },
  disabled: {
    label: 'Disconnected',
    icon: <Unplug aria-hidden="true" className="size-3.5" />,
    className: 'bg-white/6 text-fg-muted',
  },
}

export function AccountCard({ account, onChanged, onReconnect }: AccountCardProps) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = STATUS[account.status]
  const name = sourceName(account.platform)
  const attention = account.status === 'needs_reauth' || account.status === 'error'

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
    <section
      aria-label={`${name}: ${account.displayName}`}
      data-platform={account.platform}
      className={`flex flex-col rounded-panel border bg-surface-1 bg-linear-to-b from-white/5 to-white/1 p-6 ${
        attention
          ? 'border-warning/50 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_0_0_5px_color-mix(in_srgb,var(--color-warning)_7%,transparent),0_28px_56px_-22px_rgb(0_0_0/0.8)]'
          : 'border-line shadow-[inset_0_1px_0_rgb(255_255_255/0.07),0_28px_56px_-22px_rgb(0_0_0/0.8),0_18px_60px_-22px_color-mix(in_srgb,var(--platform)_33%,transparent)]'
      }`}
    >
      <div className="flex items-center gap-4">
        <PlatformTile platform={account.platform} muted={account.status === 'disabled'} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-2xl leading-7 font-bold">{name}</h3>
          <p className="truncate text-[13px] text-fg-muted">{account.displayName}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${status.className}`}
        >
          {status.icon}
          {status.label}
        </span>
        {isOnline(account.platform) && <SourceKind official={SOURCES[account.platform].official} />}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-white/4 px-4 py-3">
        <Stat label="Games">
          <span className="font-display text-[22px] leading-6 font-bold">
            {account.gameCount.toLocaleString()}
          </span>
        </Stat>
        <Stat label="Unlocked">
          <span className="font-display text-[22px] leading-6 font-bold">
            {account.unlockedCount.toLocaleString()}
          </span>
        </Stat>
        <Stat label="Last sync">
          <span
            className={`text-[13px] leading-6 font-semibold ${attention ? 'text-warning' : ''}`}
          >
            {account.syncing
              ? 'Syncing…'
              : account.lastSyncAt
                ? formatAgo(account.lastSyncAt)
                : 'Not yet'}
          </span>
        </Stat>
      </dl>

      <SyncNote account={account} />

      <div className="mt-5 flex items-center gap-2">
        {account.status === 'connected' ? (
          <Button
            variant="secondary"
            className="flex-1"
            disabled={account.syncing}
            onClick={() =>
              void run(() => window.api.syncNow({ kind: 'account', accountId: account.id }))
            }
          >
            <span className="flex items-center justify-center gap-2">
              <RefreshCw aria-hidden="true" className="size-3.5" />
              {account.syncing ? 'Syncing…' : 'Resync'}
            </span>
          </Button>
        ) : (
          onReconnect && (
            <Button className="flex-1" onClick={onReconnect}>
              <span className="flex items-center justify-center gap-2">
                <LogIn aria-hidden="true" className="size-4" />
                {account.status === 'disabled' ? 'Connect again' : 'Reconnect'}
              </span>
            </Button>
          )
        )}
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-control px-4 py-2 text-sm font-semibold text-fg-muted transition-colors hover:bg-white/6 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {account.status === 'disabled' ? 'Remove…' : 'Disconnect…'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {confirming && (
        <div
          role="group"
          aria-label={`Disconnect ${account.displayName}`}
          className="mt-4 flex flex-col gap-3 rounded-card border border-line bg-surface-2 p-4"
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
    </section>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-fg-subtle">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function SyncNote({ account }: { account: AccountSummary }) {
  const name = platformName(account.platform)

  if (account.status === 'needs_reauth') {
    return (
      <p className="mt-4 text-sm text-warning">
        {name} signed this account out. Reconnect to keep syncing; nothing is lost.
      </p>
    )
  }
  if (account.status === 'disabled') {
    return (
      <p className="mt-4 text-sm text-fg-muted">
        Not syncing. Its games stay in your library. Connect again to pick up where it left off.
      </p>
    )
  }
  if (account.syncing && account.checkedGames < account.gameCount) {
    const percent = completionPercent(account.checkedGames, account.gameCount)
    return (
      <div className="mt-4 flex flex-col gap-2">
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
          className="h-1.5 overflow-hidden rounded-full bg-white/9"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }
  return null
}
