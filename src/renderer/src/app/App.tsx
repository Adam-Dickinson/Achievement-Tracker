import { useEffect, useLayoutEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { ScrollParentContext, setScrollTop } from '@/components/scroll-parent'
import type { AppInfo } from '@shared/ipc'
import { NAV_ITEMS, type PageId } from './navigation'
import { IslandNav } from './IslandNav'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { Accounts } from '@/features/accounts/Accounts'
import { Activity } from '@/features/activity/Activity'
import { Library } from '@/features/library/Library'
import { DEFAULT_VIEW, type LibraryView } from '@/features/library/library-view'
import { GameDetail } from '@/features/game-detail/GameDetail'
import { Settings } from '@/features/settings/Settings'

interface PageContentProps {
  page: PageId
  libraryView: LibraryView
  onLibraryViewChange: (view: LibraryView) => void
  libraryScrollTop: number
  onOpenGame: (id: number, platformGameId?: number) => void
}

function PageContent({
  page,
  libraryView,
  onLibraryViewChange,
  libraryScrollTop,
  onOpenGame,
}: PageContentProps) {
  switch (page) {
    case 'dashboard':
      return <Dashboard onOpenGame={onOpenGame} />
    case 'library':
      return (
        <Library
          view={libraryView}
          onViewChange={onLibraryViewChange}
          restoreScrollTop={libraryScrollTop}
          onOpenGame={onOpenGame}
        />
      )
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
  const [libraryView, setLibraryView] = useState<LibraryView>(DEFAULT_VIEW)
  const [libraryScrollTop, setLibraryScrollTop] = useState(0)
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null)

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  useLayoutEffect(() => {
    if (scrollParent) setScrollTop(scrollParent, 0)
  }, [page, opened, scrollParent])

  const selectPage = (next: PageId) => {
    setLibraryScrollTop(0)
    setPage(next)
    setOpened(null)
  }
  const openGame = (id: number, entry?: number) => {
    const fromLibrary = page === 'library' && opened === null
    setLibraryScrollTop(fromLibrary && scrollParent ? scrollParent.scrollTop : 0)
    setPage('library')
    setOpened({ id, entry })
  }

  const current = NAV_ITEMS.find((item) => item.id === page) ?? NAV_ITEMS[0]!

  return (
    <div className="flex h-full flex-col">
      <IslandNav selected={page} onSelect={selectPage} info={info} />

      <main ref={setScrollParent} className="flex-1 overflow-y-auto p-8">
        <ScrollParentContext value={scrollParent}>
          {opened === null ? (
            <>
              <h1 className="font-display text-3xl font-semibold">{current.label}</h1>
              <p className="mt-2 text-fg-muted">{current.description}</p>
              <PageContent
                page={page}
                libraryView={libraryView}
                onLibraryViewChange={setLibraryView}
                libraryScrollTop={libraryScrollTop}
                onOpenGame={openGame}
              />
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
        </ScrollParentContext>
      </main>
    </div>
  )
}
