import { useEffect, useState } from 'react'
import type { AccountSummary } from '@shared/ipc'

export function useAccounts() {
  // null until the main process replies; [] means it replied with no accounts.
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null)
  // Bumping this re-runs the effect below, which fetches the list again.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false

    void window.api.listAccounts().then((data) => {
      if (!cancelled) {
        setAccounts(data)
      }
    })

    return () => {
      cancelled = true
    }
  }, [version])

  // The main process says when a sync has changed what this list shows.
  useEffect(() => window.api.onAccountsChanged(() => setVersion((v) => v + 1)), [])

  const reload = () => setVersion((v) => v + 1)

  return { accounts, reload }
}
