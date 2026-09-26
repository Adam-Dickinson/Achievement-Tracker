import { Crown } from 'lucide-react'
import { completionPercent } from '@shared/dashboard'
import type { LibraryGame } from '@shared/library'
import { platformName } from '@shared/platform'
import { CoverArt } from './CoverArt'

interface GameCardProps {
  game: LibraryGame
  onOpen: (id: number) => void
}

export function GameCard({ game, onOpen }: GameCardProps) {
  const synced = game.total > 0
  const percent = completionPercent(game.unlocked, game.total)
  const completed = synced && game.unlocked === game.total

  return (
    <button
      type="button"
      onClick={() => onOpen(game.id)}
      className={`flex w-full flex-col rounded-panel border bg-surface-1 p-2 text-left shadow-float transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        completed ? 'border-rarity-ultra/50' : 'border-line hover:border-primary/40'
      }`}
    >
      <div className="relative aspect-460/215 overflow-hidden rounded-card bg-surface-3">
        <CoverArt url={game.coverUrl} title={game.title} percent={synced ? percent : 0} />
        <span
          className={`absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
            completed ? 'bg-rarity-ultra text-on-rarity-ultra' : 'bg-canvas/80 text-fg'
          }`}
        >
          {completed && <Crown aria-hidden="true" className="size-3" />}
          {synced ? `${percent}%` : 'Syncing…'}
        </span>
      </div>

      <div className="flex flex-col gap-1 px-2 pt-3 pb-2">
        <span className="truncate font-semibold">{game.title}</span>
        <span className="flex flex-wrap gap-1">
          {game.platforms.map((platform) => (
            <span
              key={platform}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-subtle"
            >
              {platformName(platform)}
            </span>
          ))}
        </span>
        <span className="mt-1 flex justify-between gap-2 text-xs text-fg-muted">
          <span>
            {synced ? (
              <>
                <b className="text-fg">{game.unlocked}</b> / {game.total} achievements
              </>
            ) : (
              'Achievements not read yet'
            )}
          </span>
          {synced && (
            <span className={completed ? 'font-semibold text-rarity-ultra' : undefined}>
              {completed ? 'Completed' : `${game.total - game.unlocked} left`}
            </span>
          )}
        </span>
      </div>
    </button>
  )
}
