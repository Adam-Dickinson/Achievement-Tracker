import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { RarityChip } from '@/components/RarityChip'
import { formatUnlockDate } from '@/lib/format'
import { completionPercent } from '@shared/dashboard'
import type { GameAchievement } from '@shared/library'
import { platformName } from '@shared/platform'
import { rarityFromPercent } from '@shared/rarity'
import { AchievementRow } from './AchievementRow'
import { useGame } from './useGame'

type FilterId = 'all' | 'unlocked' | 'locked'

const FILTERS: Record<FilterId, { label: string; keep: (a: GameAchievement) => boolean }> = {
  all: { label: 'All', keep: () => true },
  unlocked: { label: 'Unlocked', keep: (a) => a.unlocked },
  locked: { label: 'Locked', keep: (a) => !a.unlocked },
}

// Rarest first; achievements with no known rarity go last.
function byRarity(a: GameAchievement, b: GameAchievement): number {
  return (a.globalPercent ?? 101) - (b.globalPercent ?? 101) || a.name.localeCompare(b.name)
}

interface GameDetailProps {
  id: number
  onBack: () => void
}

export function GameDetail({ id, onBack }: GameDetailProps) {
  const detail = useGame(id)
  const [filter, setFilter] = useState<FilterId>('all')

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-2 self-start rounded-control bg-canvas/70 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-surface-2"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Library
    </button>
  )

  if (detail === undefined) return <p role="status">Loading...</p>
  if (detail === null) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p role="status" className="text-fg-muted">
          This game is no longer in your library.
        </p>
      </div>
    )
  }

  const { game, achievements } = detail
  const percent = completionPercent(game.unlocked, game.total)
  const unlocked = achievements.filter((a) => a.unlocked)
  const rarest = unlocked.filter((a) => a.globalPercent !== null).sort(byRarity)[0]
  const shown = achievements.filter(FILTERS[filter].keep).sort(byRarity)

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-panel border border-line bg-surface-1 shadow-float">
        {game.coverUrl && (
          <img
            src={game.coverUrl}
            alt=""
            className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-2xl"
          />
        )}
        <div className="relative flex items-end justify-between gap-8 p-8">
          <div className="flex flex-col gap-6">
            {back}
            <div>
              <p className="text-sm text-fg-muted">{platformName(game.platform)}</p>
              <h1 className="font-display text-5xl font-bold">{game.title}</h1>
            </div>
          </div>
          {game.coverUrl && (
            <img
              src={game.coverUrl}
              alt=""
              className="hidden w-80 rounded-card shadow-float lg:block"
            />
          )}
        </div>
      </section>

      <div className="grid grid-cols-4 gap-4">
        <Tile label="Unlocked">
          <span className="font-display text-3xl font-bold">
            {game.unlocked} / {game.total}
          </span>
          <div
            role="progressbar"
            aria-label="Achievements unlocked"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 overflow-hidden rounded-full bg-surface-3"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </Tile>
        <Tile label="Completion">
          <span className="font-display text-3xl font-bold text-primary">{percent}%</span>
          <span className="text-xs text-fg-muted">
            {game.total - game.unlocked === 0
              ? 'All done'
              : `${game.total - game.unlocked} achievements left`}
          </span>
        </Tile>
        <Tile label="Rarest held">
          {rarest ? (
            <>
              <span className="truncate font-display text-lg font-bold">{rarest.name}</span>
              <RarityChip
                rarity={rarityFromPercent(rarest.globalPercent ?? 100)}
                className="self-start"
              />
            </>
          ) : (
            <span className="text-fg-muted">None yet</span>
          )}
        </Tile>
        <Tile label="Last unlock">
          <span className="font-display text-lg font-bold">
            {game.lastUnlockAt ? formatUnlockDate(game.lastUnlockAt) : 'None yet'}
          </span>
        </Tile>
      </div>

      <div role="group" aria-label="Show" className="flex gap-2">
        {(Object.keys(FILTERS) as FilterId[]).map((id) => {
          const count = achievements.filter(FILTERS[id].keep).length
          return (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                filter === id
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-1 text-fg-muted hover:text-fg'
              }`}
            >
              {FILTERS[id].label} {count}
            </button>
          )
        })}
      </div>

      {achievements.length === 0 ? (
        <p role="status" className="text-fg-muted">
          This game&apos;s achievements haven&apos;t been read yet. They appear after its first
          sync.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4">
          {shown.map((achievement) => (
            <AchievementRow key={achievement.id} achievement={achievement} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-panel border border-line bg-surface-1 p-5 shadow-float">
      <span className="text-[11px] font-bold tracking-widest text-fg-subtle uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}
