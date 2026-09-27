import { useLayoutEffect, useState } from 'react'
import { ScrollParentContext, setScrollTop } from '@/components/scroll-parent'
import type { Profile } from '@shared/ipc'
import { NAV_ITEMS, type PageId } from './navigation'
import { IslandNav } from './IslandNav'
import { displayName, useProfile } from './useProfile'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { Accounts } from '@/features/accounts/Accounts'
import { Activity } from '@/features/activity/Activity'
import { Library } from '@/features/library/Library'
import { DEFAULT_VIEW, type LibraryView } from '@/features/library/library-view'
import { GameDetail } from '@/features/game-detail/GameDetail'
import { Settings } from '@/features/settings/Settings'

interface PageContentProps {
  page: PageId
  profile: Profile | null
  onRename: (name: string) => Promise<void>
  libraryView: LibraryView
  onLibraryViewChange: (view: LibraryView) => void
  libraryScrollTop: number
  onOpenGame: (id: number, platformGameId?: number) => void
  onNavigate: (page: PageId) => void
}

function PageContent({
  page,
  profile,
  onRename,
  libraryView,
  onLibraryViewChange,
  libraryScrollTop,
  onOpenGame,
  onNavigate,
}: PageContentProps) {
  switch (page) {
    case 'dashboard':
      return <Dashboard onOpenGame={onOpenGame} onNavigate={onNavigate} />
    case 'library':
      return (
        <Library
          name={displayName(profile)}
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
      return <Settings profile={profile} onRename={onRename} />
  }
}

export function App() {
  const [page, setPage] = useState<PageId>('dashboard')
  const [opened, setOpened] = useState<{ id: number; entry?: number } | null>(null)
  const { profile, rename } = useProfile()
  const [libraryView, setLibraryView] = useState<LibraryView>(DEFAULT_VIEW)
  const [libraryScrollTop, setLibraryScrollTop] = useState(0)
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (scrollParent) setScrollTop(scrollParent, 0)
  }, [page, opened, scrollParent])

  const selectPage = (next: PageId) => {
    setLibraryScrollTop(0)
    setPage(next)
    setOpened(null)
  }
  const searchLibrary = (query: string) => {
    setLibraryView((view) => ({ ...view, query }))
    if (page !== 'library' || opened !== null) selectPage('library')
  }
  const openGame = (id: number, entry?: number) => {
    const fromLibrary = page === 'library' && opened === null
    setLibraryScrollTop(fromLibrary && scrollParent ? scrollParent.scrollTop : 0)
    setPage('library')
    setOpened({ id, entry })
  }

  const current = NAV_ITEMS.find((item) => item.id === page) ?? NAV_ITEMS[0]!

  return (
    <div ref={setScrollParent} className="h-full overflow-y-auto bg-aurora">
      <IslandNav
        selected={page}
        onSelect={selectPage}
        name={displayName(profile)}
        query={libraryView.query}
        onSearch={searchLibrary}
      />

      <main className="mx-auto w-[calc(100%-48px)] max-w-348 pt-7 pb-20">
        <ScrollParentContext value={scrollParent}>
          {opened === null ? (
            <>
              {!current.ownHeading && (
                <>
                  <h1 className="font-display text-3xl font-semibold">{current.label}</h1>
                  <p className="mt-2 text-fg-muted">{current.description}</p>
                </>
              )}
              <PageContent
                page={page}
                profile={profile}
                onRename={rename}
                libraryView={libraryView}
                onLibraryViewChange={setLibraryView}
                libraryScrollTop={libraryScrollTop}
                onOpenGame={openGame}
                onNavigate={selectPage}
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
        </ScrollParentContext>
      </main>
    </div>
  )
}
