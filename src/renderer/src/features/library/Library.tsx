import { useState } from 'react'
import type { LibraryGame } from '@shared/library'
import { plural } from '@/lib/format'
import { GameCard } from '@/components/GameCard'
import { useLibrary } from './useLibrary'

type SortId = 'recent' | 'completion' | 'title'

const SORTS: Record<
  SortId,
  { label: string; compare: (a: LibraryGame, b: LibraryGame) => number }
> = {
  recent: { label: 'Last unlock', compare: () => 0 },
  completion: { label: 'Completion', compare: (a, b) => ratio(b) - ratio(a) },
  title: { label: 'Name', compare: (a, b) => a.title.localeCompare(b.title) },
}

function ratio(game: LibraryGame): number {
  return game.total === 0 ? -1 : game.unlocked / game.total
}

interface LibraryProps {
  onOpenGame: (id: number) => void
}

export function Library({ onOpenGame }: LibraryProps) {
  const games = useLibrary()
  const [sort, setSort] = useState<SortId>('recent')

  if (!games) {
    return <p role="status">Loading...</p>
  }

  if (games.length === 0) {
    return (
      <p role="status" className="mt-8 text-fg-muted">
        No games yet. Connect an account on the Accounts screen and its games appear here.
      </p>
    )
  }

  const sorted = [...games].sort(SORTS[sort].compare)

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-fg-muted">{plural(games.length, 'game')}</span>
        <div
          role="group"
          aria-label="Sort by"
          className="flex gap-1 rounded-control bg-surface-1 p-1"
        >
          {(Object.keys(SORTS) as SortId[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={sort === id}
              onClick={() => setSort(id)}
              className={`rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
                sort === id ? 'bg-fg text-canvas' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {SORTS[id].label}
            </button>
          ))}
        </div>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
        {sorted.map((game) => (
          <li key={game.id} className="flex">
            <GameCard game={game} onOpen={onOpenGame} />
          </li>
        ))}
      </ul>
    </div>
  )
}
