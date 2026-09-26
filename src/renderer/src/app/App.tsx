import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import type { AppInfo } from '@shared/ipc'
import { NAV_ITEMS, type PageId } from './navigation'
import { IslandNav } from './IslandNav'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { Accounts } from '@/features/accounts/Accounts'
import { Activity } from '@/features/activity/Activity'
import { Library } from '@/features/library/Library'
import { GameDetail } from '@/features/game-detail/GameDetail'
import { Settings } from '@/features/settings/Settings'

interface PageContentProps {
  page: PageId
  onOpenGame: (id: number, platformGameId?: number) => void
}

function PageContent({ page, onOpenGame }: PageContentProps) {
  switch (page) {
    case 'dashboard':
      return <Dashboard onOpenGame={onOpenGame} />
    case 'library':
      return <Library onOpenGame={onOpenGame} />
    case 'activity':
      return <Activity onOpenGame={onOpenGame} />
    case 'accounts':
      return <Accounts />
    case 'settings':
      return <Settings />
  }
}

export function App() {
  const [page, setPage] = useState<PageId>('dashboard')
  const [opened, setOpened] = useState<{ id: number; entry?: number } | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  const selectPage = (next: PageId) => {
    setPage(next)
    setOpened(null)
  }
  const openGame = (id: number, entry?: number) => {
    setPage('library')
    setOpened({ id, entry })
  }

  const current = NAV_ITEMS.find((item) => item.id === page) ?? NAV_ITEMS[0]!

  return (
    <div className="flex h-full flex-col">
      <IslandNav selected={page} onSelect={selectPage} info={info} />

      <main className="flex-1 overflow-y-auto p-8">
        {opened === null ? (
          <>
            <h1 className="font-display text-3xl font-semibold">{current.label}</h1>
            <p className="mt-2 text-fg-muted">{current.description}</p>
            <PageContent page={page} onOpenGame={openGame} />
          </>
        ) : (
          <GameDetail
            key={`${opened.id}-${opened.entry ?? 'best'}`}
            id={opened.id}
            initialEntry={opened.entry}
            onBack={() => setOpened(null)}
          />
        )}
        <Button className="mt-4" onClick={() => void window.api.sendTestNotification()}>
          Send test notification
        </Button>
      </main>
    </div>
  )
}
