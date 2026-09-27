import { CoverArt } from '@/components/CoverArt'
import { completionPercent } from '@shared/dashboard'
import type { LibraryGame } from '@shared/library'

const SLOTS = [
  { left: 124, top: 8, rotate: 6 },
  { left: 10, top: 100, rotate: -5 },
  { left: 126, top: 192, rotate: 4 },
  { left: 18, top: 284, rotate: -3 },
] as const

interface CoverFanProps {
  games: readonly LibraryGame[]
  onOpenGame: (id: number) => void
}

export function CoverFan({ games, onOpenGame }: CoverFanProps) {
  return (
    <div className="absolute top-6 right-6 hidden h-105 w-95 xl:block">
      {SLOTS.map((slot, i) => {
        const game = games[i]
        if (!game) return null
        const percent = completionPercent(game.unlocked, game.total)
        return (
          <button
            key={game.id}
            type="button"
            aria-label={`${game.title}, ${percent}%`}
            onClick={() => onOpenGame(game.id)}
            className="absolute w-63 rounded-[22px] border border-line bg-surface-1 p-1.5 shadow-float transition hover:z-10 hover:-translate-y-1"
            style={{
              left: slot.left,
              top: slot.top,
              zIndex: i + 1,
              transform: `rotate(${slot.rotate}deg)`,
            }}
          >
            <span className="relative block aspect-460/215 overflow-hidden rounded-2xl bg-surface-3">
              <CoverArt url={game.coverUrl} title={game.title} percent={percent} />
              <span className="absolute top-2.5 left-2.5 rounded-full border border-white/14 bg-canvas/60 px-2.5 py-0.5 font-display text-sm font-extrabold backdrop-blur-md">
                {percent}%
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
