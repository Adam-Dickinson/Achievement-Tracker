import { UnlockRow } from '@/components/UnlockRow'
import { formatUnlockDate } from '@/lib/format'
import type { RecentUnlock } from '@shared/library'

interface RecentUnlocksProps {
  unlocks: readonly RecentUnlock[]
  onOpenGame: (id: number, platformGameId?: number) => void
}

export function RecentUnlocks({ unlocks, onOpenGame }: RecentUnlocksProps) {
  if (unlocks.length === 0) {
    return <p className="text-fg-muted">Nothing unlocked yet. New unlocks appear here.</p>
  }

  return (
    <ul className="flex flex-col divide-y divide-line rounded-panel border border-line bg-surface-1 shadow-float">
      {unlocks.map((unlock) => (
        <UnlockRow
          key={unlock.achievementId}
          unlock={unlock}
          when={formatUnlockDate(unlock.unlockedAt)}
          onOpenGame={onOpenGame}
        />
      ))}
    </ul>
  )
}
