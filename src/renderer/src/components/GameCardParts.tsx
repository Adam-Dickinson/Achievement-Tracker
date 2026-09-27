import { Crown } from 'lucide-react'
import type { LibraryGame } from '@shared/library'
import type { GameProgress } from './game-progress'
import { PlatformBadge } from './PlatformBadge'

export function cardShell(progress: GameProgress): string {
  return `flex w-full flex-col rounded-panel border bg-surface-1 bg-linear-to-b from-white/5 to-white/1 p-2 text-left shadow-float transition duration-200 hover:-translate-y-2.5 hover:scale-[1.02] hover:border-primary/55 hover:ring-4 hover:ring-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 ${
    progress.completed ? 'border-rarity-ultra/40' : 'border-white/7.5'
  }`
}

export function PercentPill({ progress }: { progress: GameProgress }) {
  return (
    <span
      className={`absolute top-2.5 left-2.5 flex h-6.5 items-center gap-1.25 rounded-full border px-2.5 font-display text-sm font-extrabold backdrop-blur-md ${
        progress.completed
          ? 'border-transparent bg-linear-to-r from-rarity-ultra-light to-rarity-ultra-dark text-on-rarity-ultra'
          : 'border-white/14 bg-canvas/62 text-fg'
      }`}
    >
      {progress.completed && <Crown aria-hidden="true" className="size-3.5" />}
      {progress.synced ? `${progress.percent}%` : 'Syncing…'}
    </span>
  )
}

export function GameCardFooter({ game, progress }: { game: LibraryGame; progress: GameProgress }) {
  return (
    <div className="flex flex-col gap-1.5 px-3 pt-3 pb-3">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{game.title}</span>
        <span className="flex shrink-0 -space-x-1">
          {game.platforms.map((platform) => (
            <PlatformBadge key={platform} platform={platform} />
          ))}
        </span>
      </span>
      <span className="flex justify-between gap-2 text-xs text-fg-muted">
        <span>
          {progress.synced ? (
            <>
              <b className="font-semibold text-fg">{game.unlocked}</b> / {game.total} achievements
            </>
          ) : (
            'Achievements not read yet'
          )}
        </span>
        {progress.synced && (
          <span className={progress.completed ? 'font-semibold text-rarity-ultra' : undefined}>
            {progress.completed ? 'Completed' : `${progress.left} left`}
          </span>
        )}
      </span>
    </div>
  )
}
