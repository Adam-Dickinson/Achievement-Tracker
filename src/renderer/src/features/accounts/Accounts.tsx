import type { AccountSummary } from '@shared/ipc'
import { AccountCard } from './AccountCard'
import { EaConnectCard } from './EaConnectCard'
import { EpicConnectCard } from './EpicConnectCard'
import { SteamConnectForm } from './SteamConnectForm'
import { SteamFamilyCard } from './SteamFamilyCard'
import { UbisoftConnectCard } from './UbisoftConnectCard'
import { useAccounts } from './useAccounts'
import { XboxConnectCard } from './XboxConnectCard'

export function Accounts() {
  const { accounts, reload } = useAccounts()

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SteamConnectForm onConnected={reload} />
        <SteamFamilyCard
          steamConnected={accounts?.some((account) => account.platform === 'steam') ?? false}
          onConnected={reload}
        />
        <XboxConnectCard onConnected={reload} />
        <EpicConnectCard onConnected={reload} />
        <UbisoftConnectCard onConnected={reload} />
        <EaConnectCard onConnected={reload} />
      </div>
      <AccountList accounts={accounts} />
    </div>
  )
}

function AccountList({ accounts }: { accounts: AccountSummary[] | null }) {
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

  return (
    <ul className="flex flex-col gap-4">
      {accounts.map((account) => (
        <li key={account.id}>
          <AccountCard account={account} />
        </li>
      ))}
    </ul>
  )
}
