import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import type { AppInfo } from '@shared/ipc'
import { NAV_ITEMS, type PageId } from './navigation'
import { IslandNav } from './IslandNav'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { Accounts } from '@/features/accounts/Accounts'
import { Library } from '@/features/library/Library'
import { GameDetail } from '@/features/game-detail/GameDetail'

interface PageContentProps {
  page: PageId
  onOpenGame: (id: number) => void
}

/**
 * The main window's shell. Screens are built milestone by milestone under `features/`; target
 * designs are in docs/design/mockups/. Pages without a screen yet show a placeholder.
 */
function PageContent({ page, onOpenGame }: PageContentProps) {
  switch (page) {
    case 'dashboard':
      return <Dashboard />
    case 'library':
      return <Library onOpenGame={onOpenGame} />
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
  // The game open in Game detail, if any. It sits "inside" the Library page.
  const [gameId, setGameId] = useState<number | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)

  // Effect: runs once after the first render, to ask the main process for the app's details.
  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  const selectPage = (next: PageId) => {
    setPage(next)
    setGameId(null)
  }
  const openGame = (id: number) => {
    setPage('library')
    setGameId(id)
  }

  // The `?? NAV_ITEMS[0]!` is only a type-level fallback: `page` is always a valid id.
  const current = NAV_ITEMS.find((item) => item.id === page) ?? NAV_ITEMS[0]!

  return (
    <div className="flex h-full flex-col">
      <IslandNav selected={page} onSelect={selectPage} info={info} />

      <main className="flex-1 overflow-y-auto p-8">
        {gameId === null ? (
          <>
            <h1 className="font-display text-3xl font-semibold">{current.label}</h1>
            <p className="mt-2 text-fg-muted">{current.description}</p>
            <PageContent page={page} onOpenGame={openGame} />
          </>
        ) : (
          // key: a different game is a fresh screen, so no state carries over from the last one.
          <GameDetail key={gameId} id={gameId} onBack={() => setGameId(null)} />
        )}
        <Button className="mt-4" onClick={() => void window.api.sendTestNotification()}>
          Send test notification
        </Button>
      </main>
    </div>
  )
}
