import { CoverArt } from '@/components/CoverArt'
import { PlatformBadge } from '@/components/PlatformBadge'
import { RarityChip } from '@/components/RarityChip'
import { formatPercent, formatUnlockDate } from '@/lib/format'
import type { RarestUnlock } from '@shared/dashboard'
import { rarityFromPercent } from '@shared/rarity'

interface RarestUnlockCardProps {
  unlock: RarestUnlock | null
  onOpenGame: (id: number, platformGameId?: number) => void
  className?: string
}

const TITLE = 'text-xs font-bold tracking-[0.12em] uppercase'

export function RarestUnlockCard({ unlock, onOpenGame, className = '' }: RarestUnlockCardProps) {
  if (!unlock || unlock.globalPercent === null) {
    return (
      <section
        aria-labelledby="rarest-title"
        className={`flex flex-col justify-end gap-2 rounded-panel border border-line bg-surface-1 p-7 shadow-float ${className}`}
      >
        <p id="rarest-title" className={`${TITLE} text-fg-muted`}>
          Rarest unlock
        </p>
        <p className="text-fg-muted">
          Your rarest unlock appears here once a platform reports how many players have each
          achievement.
        </p>
      </section>
    )
  }

  const rarity = rarityFromPercent(unlock.globalPercent)
  return (
    <section
      aria-labelledby="rarest-title"
      data-rarity={rarity}
      className={`flex flex-col rounded-panel border border-(--rarity)/50 bg-surface-1 p-3 shadow-spotlight ${className}`}
    >
      <button
        type="button"
        onClick={() => onOpenGame(unlock.gameId, unlock.platformGameId)}
        className="flex w-full flex-1 flex-col text-left"
      >
        <span className="relative block min-h-60 flex-1 overflow-hidden rounded-[20px] bg-surface-3">
          <CoverArt url={unlock.coverUrl} title={unlock.gameTitle} percent={100} />
          <RarityChip rarity={rarity} className="absolute top-3 left-3" />
        </span>
        <span className="flex flex-col p-4">
          <span id="rarest-title" className={`${TITLE} text-(--rarity)`}>
            Rarest unlock
          </span>
          <span className="mt-1 font-display text-3xl leading-8 font-extrabold">{unlock.name}</span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-fg-muted">
            <PlatformBadge platform={unlock.platform} size={20} />
            <span className="truncate">
              {unlock.gameTitle}
              {unlock.unlockedAt && ` · ${formatUnlockDate(unlock.unlockedAt)}`}
            </span>
          </span>
          <span className="mt-4 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
            <span className="text-[13px] text-fg-muted">Global unlock rate</span>
            <span className="font-display text-[26px] font-extrabold text-(--rarity)">
              {formatPercent(unlock.globalPercent)}
            </span>
          </span>
        </span>
      </button>
    </section>
  )
}
