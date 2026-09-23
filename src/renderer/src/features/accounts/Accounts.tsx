import type { AccountSummary } from '@shared/ipc'
import { AccountCard } from './AccountCard'
import { SteamConnectForm } from './SteamConnectForm'
import { useAccounts } from './useAccounts'

export function Accounts() {
  const { accounts, reload } = useAccounts()

  return (
    <div className="mt-8 flex flex-col gap-6">
      <SteamConnectForm onConnected={reload} />
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
