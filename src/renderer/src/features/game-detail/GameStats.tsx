import type { ReactNode } from 'react'
import { RarityChip } from '@/components/RarityChip'
import { formatTime, formatUnlockDate } from '@/lib/format'
import { completionPercent } from '@shared/dashboard'
import type { GameAchievement, GameEntry } from '@shared/library'
import { rarityFromPercent } from '@shared/rarity'
import { byRarity } from './achievement-view'
import { entryLabel } from './entry-label'

export function latestUnlock(achievements: readonly GameAchievement[]): Date | null {
  return achievements.reduce<Date | null>(
    (latest, a) => (a.unlockedAt && (!latest || a.unlockedAt > latest) ? a.unlockedAt : latest),
    null,
  )
}

export function GameStats({ entry }: { entry: GameEntry }) {
  const percent = completionPercent(entry.unlocked, entry.total)
  const left = entry.total - entry.unlocked
  const rarest = entry.achievements
    .filter((a) => a.unlocked && a.globalPercent !== null)
    .sort(byRarity)[0]
  const lastUnlockAt = latestUnlock(entry.achievements)
  const [day] = lastUnlockAt ? formatUnlockDate(lastUnlockAt).split(', ') : []

  return (
    <div className="relative z-10 -mt-12 grid grid-cols-2 gap-5 px-8 lg:grid-cols-4">
      <Tile label="Unlocked">
        <span className="font-display text-[34px] leading-9 font-extrabold">
          {entry.unlocked}
          <span className="text-fg-muted"> / {entry.total}</span>
        </span>
        <div
          role="progressbar"
          aria-label="Achievements unlocked"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-1 h-2.25 overflow-hidden rounded-full bg-white/9"
        >
          <div
            className="h-full rounded-full bg-linear-to-r from-primary/75 to-primary shadow-glow-primary"
            style={{ width: `${percent}%` }}
          />
        </div>
      </Tile>
      <Tile label="Completion">
        <span className="font-display text-[34px] leading-9 font-extrabold text-primary">
          {percent}%
        </span>
        <span className="text-xs text-fg-muted">
          {left === 0 ? 'All done' : `${left} achievements left`}
        </span>
      </Tile>
      <Tile label="Rarest held">
        {rarest ? (
          <>
            <span
              data-rarity={rarityFromPercent(rarest.globalPercent ?? 100)}
              className="truncate font-display text-[22px] leading-9 font-extrabold text-(--rarity)"
            >
              {rarest.name}
            </span>
            <RarityChip
              rarity={rarityFromPercent(rarest.globalPercent ?? 100)}
              className="self-start"
            />
          </>
        ) : (
          <span className="font-display text-[22px] leading-9 font-extrabold text-fg-muted">
            None yet
          </span>
        )}
      </Tile>
      <Tile label="Last unlock">
        {lastUnlockAt ? (
          <>
            <span className="font-display text-[34px] leading-9 font-extrabold">{day}</span>
            <span className="text-xs text-fg-muted">
              {formatTime(lastUnlockAt)} · {entryLabel(entry)}
            </span>
          </>
        ) : (
          <span className="font-display text-[34px] leading-9 font-extrabold text-fg-muted">
            None yet
          </span>
        )}
      </Tile>
    </div>
  )
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-panel border border-line bg-surface-1 bg-linear-to-b from-white/5 to-white/1 p-5 shadow-float">
      <span className="text-xs font-bold tracking-widest text-fg-muted uppercase">{label}</span>
      {children}
    </div>
  )
}
