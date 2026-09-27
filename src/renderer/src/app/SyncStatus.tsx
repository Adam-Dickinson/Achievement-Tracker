import { Plug, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAccounts } from '@/features/accounts/useAccounts'
import { formatAgo } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { syncState } from './sync-state'

const MINUTE_MS = 60_000
const PILL =
  'flex h-10 shrink-0 items-center gap-2 rounded-full bg-white/6 px-4 text-[13px] font-semibold whitespace-nowrap transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:hover:bg-white/6'

interface SyncStatusProps {
  onOpenAccounts: () => void
}

export function SyncStatus({ onOpenAccounts }: SyncStatusProps) {
  const { accounts } = useAccounts()
  const now = useNow(MINUTE_MS)
  const [starting, setStarting] = useState(false)

  if (accounts === null) return null

  const syncAll = async () => {
    setStarting(true)
    try {
      await window.api.syncNow({ kind: 'all' })
    } finally {
      setStarting(false)
    }
  }

  const state = starting ? { kind: 'syncing' as const } : syncState(accounts)

  switch (state.kind) {
    case 'no_accounts':
      return (
        <button type="button" onClick={onOpenAccounts} className={PILL}>
          <Plug size={15} aria-hidden="true" className="text-fg-muted" />
          Connect an account
        </button>
      )
    case 'attention':
      return (
        <button type="button" onClick={onOpenAccounts} className={PILL}>
          <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
          Check accounts
        </button>
      )
    case 'syncing':
      return (
        <button type="button" disabled aria-busy="true" className={PILL}>
          <RefreshCw
            size={15}
            aria-hidden="true"
            className="text-fg-muted motion-safe:animate-spin"
          />
          Syncing…
        </button>
      )
    case 'synced': {
      const label = state.at ? `Synced ${formatAgo(state.at, now)}` : 'Not synced yet'
      return (
        <button
          type="button"
          aria-label={`${label}, sync all now`}
          title="Sync all now"
          onClick={() => void syncAll()}
          className={PILL}
        >
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-success shadow-pulse-success"
          />
          {label}
          <RefreshCw size={15} aria-hidden="true" className="text-fg-muted" />
        </button>
      )
    }
  }
}
