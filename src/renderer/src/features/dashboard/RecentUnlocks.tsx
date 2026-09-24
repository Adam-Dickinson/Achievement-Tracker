import { Trophy } from 'lucide-react'
import { useState } from 'react'
import { RarityChip } from '@/components/RarityChip'
import { formatPercent, formatUnlockDate } from '@/lib/format'
import type { RecentUnlock } from '@shared/library'
import { platformName } from '@shared/platform'
import { rarityFromPercent } from '@shared/rarity'

interface RecentUnlocksProps {
  unlocks: readonly RecentUnlock[]
  onOpenGame: (id: number) => void
}

export function RecentUnlocks({ unlocks, onOpenGame }: RecentUnlocksProps) {
  if (unlocks.length === 0) {
    return <p className="text-fg-muted">Nothing unlocked yet. New unlocks appear here.</p>
  }

  return (
    <ul className="flex flex-col divide-y divide-line rounded-panel border border-line bg-surface-1 shadow-float">
      {unlocks.map((unlock) => {
        const rarity =
          unlock.globalPercent === null ? null : rarityFromPercent(unlock.globalPercent)
        return (
          <li key={unlock.achievementId}>
            <button
              type="button"
              onClick={() => onOpenGame(unlock.gameId)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors first:rounded-t-panel last:rounded-b-panel hover:bg-surface-2"
            >
              <UnlockIcon url={unlock.iconUrl} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{unlock.name}</span>
                <span className="truncate text-sm text-fg-muted">
                  {unlock.gameTitle} · {platformName(unlock.platform)}
                </span>
              </span>
              {rarity && <RarityChip rarity={rarity} />}
              {unlock.globalPercent !== null && (
                <span className="w-16 text-right font-display text-lg font-bold">
                  {formatPercent(unlock.globalPercent)}
                </span>
              )}
              <span className="w-32 text-right text-xs text-fg-muted">
                {formatUnlockDate(unlock.unlockedAt)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function UnlockIcon({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)
  const box = 'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-card'

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
