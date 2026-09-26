import { useId, useState } from 'react'
import { Button } from '@/components/Button'
import { useLibrary } from '@/features/library/useLibrary'
import { matchesSearch, searchWords } from '@/lib/search'
import { platformName } from '@shared/platform'

const MAX_RESULTS = 20

interface LinkGameProps {
  gameId: number
  onPick: (gameId: number) => void
  onClose: () => void
}

export function LinkGame({ gameId, onPick, onClose }: LinkGameProps) {
  const games = useLibrary()
  const [query, setQuery] = useState('')
  const id = useId()
  const words = searchWords(query)
  const matches =
    words.length === 0
      ? []
      : (games ?? [])
          .filter((game) => game.id !== gameId && matchesSearch(game.title, words))
          .slice(0, MAX_RESULTS)

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Link another game
        </h2>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <label className="flex flex-col gap-2 text-sm text-fg-muted">
        Find the same game on another platform
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type part of its name"
          className="rounded-control border border-line bg-canvas px-3 py-2 text-fg"
        />
      </label>

      {games === null && <p role="status">Loading...</p>}
      {games !== null && words.length > 0 && matches.length === 0 && (
        <p role="status" className="text-sm text-fg-muted">
          No other game in your library matches “{query.trim()}”.
        </p>
      )}
      {matches.length > 0 && (
        <ul aria-label="Matching games" className="flex flex-col gap-1">
          {matches.map((game) => (
            <li key={game.id}>
              <button
                type="button"
                onClick={() => onPick(game.id)}
                className="flex w-full items-center justify-between gap-4 rounded-control px-3 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <span className="truncate font-semibold">{game.title}</span>
                <span className="shrink-0 text-xs text-fg-muted">
                  {game.platforms.map(platformName).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
