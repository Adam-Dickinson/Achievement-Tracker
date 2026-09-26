import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { RarityChip } from '@/components/RarityChip'
import { formatUnlockDate } from '@/lib/format'
import { completionPercent } from '@shared/dashboard'
import type { GameAchievement } from '@shared/library'
import { platformName } from '@shared/platform'
import { rarityFromPercent } from '@shared/rarity'
import { AchievementRow } from './AchievementRow'
import { entryLabel } from './entry-label'
import { EntryTabs } from './EntryTabs'
import { LinkGame } from './LinkGame'
import { useGame } from './useGame'

type FilterId = 'all' | 'unlocked' | 'locked'

const FILTERS: Record<FilterId, { label: string; keep: (a: GameAchievement) => boolean }> = {
  all: { label: 'All', keep: () => true },
  unlocked: { label: 'Unlocked', keep: (a) => a.unlocked },
  locked: { label: 'Locked', keep: (a) => !a.unlocked },
}

function byRarity(a: GameAchievement, b: GameAchievement): number {
  return (a.globalPercent ?? 101) - (b.globalPercent ?? 101) || a.name.localeCompare(b.name)
}

function latestUnlock(achievements: readonly GameAchievement[]): Date | null {
  return achievements.reduce<Date | null>(
    (latest, a) => (a.unlockedAt && (!latest || a.unlockedAt > latest) ? a.unlockedAt : latest),
    null,
  )
}

interface GameDetailProps {
  id: number
  initialEntry?: number
  onBack: () => void
}

export function GameDetail({ id, initialEntry, onBack }: GameDetailProps) {
  const { detail, reload } = useGame(id)
  const [filter, setFilter] = useState<FilterId>('all')
  const [selected, setSelected] = useState(initialEntry)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(run: () => Promise<void>) {
    setError(null)
    try {
      await run()
      reload()
    } catch {
      setError('Something went wrong while changing the link. Try again.')
    }
  }

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
  const entry = detail?.entries.find((e) => e.platformGameId === selected) ?? detail?.entries[0]
  if (!detail || !entry) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p role="status" className="text-fg-muted">
          This game is no longer in your library.
        </p>
      </div>
    )
  }

  const { game, entries } = detail
  const { achievements } = entry
  const percent = completionPercent(entry.unlocked, entry.total)
  const lastUnlockAt = latestUnlock(achievements)

  const link = (otherGameId: number) =>
    change(async () => {
      await window.api.mergeGames({ intoGameId: game.id, gameId: otherGameId })
      setLinking(false)
    })
  const unlink = () =>
    change(async () => {
      await window.api.unlinkGame({ platformGameId: entry.platformGameId })
      setSelected(undefined)
    })
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
              <p className="text-sm text-fg-muted">
                {game.platforms.map(platformName).join(' · ')}
              </p>
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

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => setLinking((open) => !open)}>
          Link another game…
        </Button>
        {entries.length > 1 && (
          <Button variant="secondary" onClick={() => void unlink()}>
            Unlink {entryLabel(entry)}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {linking && (
        <LinkGame
          gameId={game.id}
          onPick={(otherGameId) => void link(otherGameId)}
          onClose={() => setLinking(false)}
        />
      )}

      {entries.length > 1 && (
        <EntryTabs entries={entries} selected={entry.platformGameId} onSelect={setSelected} />
      )}

      <div
        id="entry-panel"
        role={entries.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={entries.length > 1 ? `entry-tab-${entry.platformGameId}` : undefined}
        className="flex flex-col gap-6"
      >
        <div className="grid grid-cols-4 gap-4">
          <Tile label="Unlocked">
            <span className="font-display text-3xl font-bold">
              {entry.unlocked} / {entry.total}
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
              {entry.total - entry.unlocked === 0
                ? 'All done'
                : `${entry.total - entry.unlocked} achievements left`}
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
              {lastUnlockAt ? formatUnlockDate(lastUnlockAt) : 'None yet'}
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
