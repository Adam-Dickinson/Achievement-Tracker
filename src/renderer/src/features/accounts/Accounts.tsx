import { Button } from '@/components/Button'
import type { AccountSummary } from '@shared/ipc'
import { AccountCard } from './AccountCard'
import { EaConnectCard } from './EaConnectCard'
import { EpicConnectCard } from './EpicConnectCard'
import { PlayStationConnectCard } from './PlayStationConnectCard'
import { SteamConnectCard } from './SteamConnectCard'
import { UbisoftConnectCard } from './UbisoftConnectCard'
import { useAccounts } from './useAccounts'
import { XboxConnectCard } from './XboxConnectCard'

export function Accounts() {
  const { accounts, reload } = useAccounts()

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SteamConnectCard onConnected={reload} />
        <XboxConnectCard onConnected={reload} />
        <PlayStationConnectCard onConnected={reload} />
        <EpicConnectCard onConnected={reload} />
        <UbisoftConnectCard onConnected={reload} />
        <EaConnectCard onConnected={reload} />
      </div>
      <AccountList accounts={accounts} onChanged={reload} />
    </div>
  )
}

interface AccountListProps {
  accounts: AccountSummary[] | null
  onChanged: () => void
}

function AccountList({ accounts, onChanged }: AccountListProps) {
  if (!accounts) {
    return <p role="status">Loading...</p>
  }

  if (accounts.length === 0) {
    return (
      <p role="status" className="text-fg-muted">
        No accounts connected yet.
      </p>
    )
  }

  const anyConnected = accounts.some((account) => account.status === 'connected')

  return (
    <section aria-labelledby="your-accounts" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="your-accounts" className="font-display text-2xl font-bold">
          Your accounts
        </h2>
        {anyConnected && (
          <Button variant="secondary" onClick={() => void window.api.syncNow({ kind: 'all' })}>
            Sync all
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-4">
        {accounts.map((account) => (
          <li key={account.id}>
            <AccountCard account={account} onChanged={onChanged} />
          </li>
        ))}
      </ul>
    </section>
  )
}
