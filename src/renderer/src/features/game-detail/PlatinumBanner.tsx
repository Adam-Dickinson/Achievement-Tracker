import { Crown, Lock } from 'lucide-react'
import { PlatinumChip } from '@/components/PlatinumChip'
import { formatUnlockDate, plural } from '@/lib/format'
import type { GameEntry } from '@shared/library'

interface PlatinumBannerProps {
  entry: GameEntry
}

interface PlatinumState {
  readonly earned: boolean
  readonly title: string
  readonly detail: string
}

export function PlatinumBanner({ entry }: PlatinumBannerProps) {
  const state = platinumState(entry)
  if (!state) return null

  return (
    <section
      aria-label="Platinum"
      data-platinum={state.earned ? '' : undefined}
      className={`flex items-center gap-5 rounded-panel border bg-surface-1 p-5 shadow-float ${
        state.earned
          ? 'border-(--rarity)/50 bg-linear-to-r from-(--rarity)/12 to-transparent'
          : 'border-line'
      }`}
    >
      <div
        className={`flex size-16 shrink-0 items-center justify-center rounded-card ${
          state.earned
            ? 'bg-linear-140 from-(--rarity-light) to-(--rarity-dark) text-(--rarity-on) shadow-tile'
            : 'border border-line bg-surface-2 text-fg-subtle'
        }`}
      >
        {state.earned ? (
          <Crown aria-hidden="true" className="size-7" />
        ) : (
          <Lock aria-hidden="true" className="size-6" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <PlatinumChip className="self-start" />
        <p className="truncate font-display text-xl font-bold">{state.title}</p>
        <p className="text-sm text-fg-muted">{state.detail}</p>
      </div>
    </section>
  )
}

function platinumState(entry: GameEntry): PlatinumState | null {
  const { achievements } = entry
  if (achievements.length === 0) return null

  const own = achievements.find((a) => a.platinum)
  const left = achievements.filter((a) => !a.unlocked && !a.platinum).length
  const toGo = `${plural(left, 'achievement')} to go`

  if (own) {
    if (own.unlocked) {
      return { earned: true, title: own.name, detail: earnedText(own.unlockedAt) }
    }
    return {
      earned: false,
      title: own.hidden ? 'Hidden platinum' : own.name,
      detail: left === 0 ? 'Every other achievement is unlocked' : toGo,
    }
  }
  if (entry.appPlatinum) {
    return {
      earned: true,
      title: `Every achievement in ${entry.title}`,
      detail: earnedText(entry.appPlatinum.earnedAt),
    }
  }
  return {
    earned: false,
    title: `Unlock all ${plural(achievements.length, 'achievement')} to earn this game's Platinum`,
    detail: toGo,
  }
}

function earnedText(date: Date | null): string {
  return date ? `Earned ${formatUnlockDate(date)}` : 'Earned'
}
