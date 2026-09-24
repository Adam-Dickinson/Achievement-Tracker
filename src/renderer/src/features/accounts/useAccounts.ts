import { useEffect, useState } from 'react'
import type { AccountSummary } from '@shared/ipc'

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null)
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

  useEffect(() => window.api.onDataChanged(() => setVersion((v) => v + 1)), [])

  const reload = () => setVersion((v) => v + 1)

  return { accounts, reload }
}
