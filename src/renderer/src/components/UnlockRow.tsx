import { Trophy } from 'lucide-react'
import { useState } from 'react'
import { PlatformBadge } from '@/components/PlatformBadge'
import { PlatinumChip } from '@/components/PlatinumChip'
import { RarityChip } from '@/components/RarityChip'
import { formatPercent } from '@/lib/format'
import type { UnlockedAchievement } from '@shared/library'
import { rarityFromPercent } from '@shared/rarity'

interface UnlockRowProps {
  unlock: UnlockedAchievement
  when: string
  day?: string
  showDescription?: boolean
  onOpenGame: (id: number, platformGameId?: number) => void
}

export function UnlockRow({
  unlock,
  when,
  day,
  showDescription = false,
  onOpenGame,
}: UnlockRowProps) {
  const rarity = unlock.globalPercent === null ? null : rarityFromPercent(unlock.globalPercent)

  return (
    <li>
      <button
        type="button"
        data-platinum={unlock.platinum ? '' : undefined}
        onClick={() => onOpenGame(unlock.gameId, unlock.platformGameId)}
        className="flex w-full items-center gap-4 rounded-[20px] p-3 text-left transition-colors hover:bg-white/5"
      >
        <UnlockIcon url={unlock.iconUrl} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">{unlock.name}</span>
          {showDescription && unlock.description && (
            <span className="truncate text-[13px] text-fg/80">{unlock.description}</span>
          )}
          <span className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-fg-muted">
            <PlatformBadge platform={unlock.platform} size={18} />
            <span className="truncate">{unlock.gameTitle}</span>
          </span>
        </span>
        {unlock.platinum && <PlatinumChip />}
        {rarity && <RarityChip rarity={rarity} />}
        <span className="w-16 text-right font-display text-xl font-bold">
          {unlock.globalPercent !== null && formatPercent(unlock.globalPercent)}
        </span>
        <span className="w-24 text-right text-[13px] text-fg-muted">
          {day && (
            <span className={`block font-semibold ${day === 'Today' ? 'text-primary' : 'text-fg'}`}>
              {day}
            </span>
          )}
          {when}
        </span>
      </button>
    </li>
  )
}

function UnlockIcon({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)
  const box =
    'flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-[15px] shadow-float'

  if (!url || failed) {
    return (
      <span className={`${box} bg-surface-2 text-fg-subtle`}>
        <Trophy aria-hidden="true" className="size-5" />
      </span>
    )
  }
  return (
    <span className={box}>
      <img src={url} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
    </span>
  )
}
