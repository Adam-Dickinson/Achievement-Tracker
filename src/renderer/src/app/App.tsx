import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import type { AppInfo } from '@shared/ipc'
import { NAV_ITEMS, type PageId } from './navigation'
import { IslandNav } from './IslandNav'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { Accounts } from '@/features/accounts/Accounts'

/**
 * The main window's shell. Screens are built milestone by milestone under `features/`; target
 * designs are in docs/design/mockups/. Pages without a screen yet show a placeholder.
 */
function PageContent({ page }: { page: PageId }) {
  switch (page) {
    case 'dashboard':
      return <Dashboard />
    case 'accounts':
      return <Accounts />
    default:
      return (
        <p className="mt-8 text-fg-subtle">
          Scaffold ready. Screens are built milestone by milestone: see docs/ROADMAP.md.
        </p>
      )
  }
}

export function App() {
  // State: React re-renders this component whenever a setter below is called.
  const [page, setPage] = useState<PageId>('dashboard')
  const [info, setInfo] = useState<AppInfo | null>(null)

  // Effect: runs once after the first render, to ask the main process for the app's details.
  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  // The `?? NAV_ITEMS[0]!` is only a type-level fallback: `page` is always a valid id.
  const current = NAV_ITEMS.find((item) => item.id === page) ?? NAV_ITEMS[0]!

  return (
    <div className="flex h-full flex-col">
      <IslandNav selected={page} onSelect={setPage} info={info} />

      <main className="flex-1 overflow-y-auto p-8">
        <h1 className="font-display text-3xl font-semibold">{current.label}</h1>
        <p className="mt-2 text-fg-muted">{current.description}</p>
        <PageContent page={page} />
        <Button className="mt-4" onClick={() => void window.api.sendTestNotification()}>
          Send test notification
        </Button>
      </main>
    </div>
  )
}
