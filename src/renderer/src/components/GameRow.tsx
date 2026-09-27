import { Crown } from 'lucide-react'
import { formatUnlockDate } from '@/lib/format'
import type { LibraryGame } from '@shared/library'
import { CoverArt } from './CoverArt'
import { gameProgress } from './game-progress'
import { PlatformBadge } from './PlatformBadge'

interface GameRowProps {
  game: LibraryGame
  onOpen: (id: number) => void
}

export function GameRow({ game, onOpen }: GameRowProps) {
  const progress = gameProgress(game)

  return (
    <button
      type="button"
      onClick={() => onOpen(game.id)}
      className={`flex w-full items-center gap-5 rounded-card border bg-surface-1 p-2 pr-6 text-left transition-colors hover:border-primary/55 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        progress.completed ? 'border-rarity-ultra/40' : 'border-white/7.5'
      }`}
    >
      <div className="relative aspect-460/215 w-32 shrink-0 overflow-hidden rounded-xl bg-surface-3">
        <CoverArt url={game.coverUrl} title={game.title} percent={progress.percent} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-[15px] font-semibold">{game.title}</span>
          <span className="flex shrink-0 -space-x-1">
            {game.platforms.map((platform) => (
              <PlatformBadge key={platform} platform={platform} size={20} />
            ))}
          </span>
        </span>
        <span aria-hidden="true" className="h-1.5 max-w-md overflow-hidden rounded-full bg-white/9">
          <span
            className={`block h-full rounded-full ${
              progress.completed
                ? 'bg-linear-to-r from-rarity-ultra-dark to-rarity-ultra-light'
                : 'bg-linear-to-r from-primary/75 to-primary shadow-glow-primary'
            }`}
            style={{ width: `${progress.percent}%` }}
          />
        </span>
      </div>

      <span className="w-36 shrink-0 text-right text-xs text-fg-muted">
        {progress.synced ? (
          <>
            <b className="font-semibold text-fg">{game.unlocked}</b> / {game.total}
            <span className="block">
              {progress.completed ? 'Completed' : `${progress.left} left`}
            </span>
          </>
        ) : (
          'Not read yet'
        )}
      </span>

      <span
        className={`flex w-18 shrink-0 items-center justify-end gap-1 font-display text-xl font-extrabold ${
          progress.completed ? 'text-rarity-ultra' : ''
        }`}
      >
        {progress.completed && <Crown aria-hidden="true" className="size-4" />}
        {progress.synced ? `${progress.percent}%` : '–'}
      </span>

      <span className="hidden w-32 shrink-0 text-right text-xs text-fg-muted lg:block">
        {game.lastUnlockAt ? (
          <>
            Last unlock
            <span className="block font-semibold text-fg">
              {formatUnlockDate(game.lastUnlockAt)}
            </span>
          </>
        ) : (
          'No unlocks yet'
        )}
      </span>
    </button>
  )
}
