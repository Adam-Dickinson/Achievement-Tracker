import { UnlockRow } from '@/components/UnlockRow'
import { formatUnlockDate } from '@/lib/format'
import type { UnlockedAchievement } from '@shared/library'

interface UnlockListProps {
  unlocks: readonly UnlockedAchievement[]
  onOpenGame: (id: number, platformGameId?: number) => void
}

export function UnlockList({ unlocks, onOpenGame }: UnlockListProps) {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-panel border border-line bg-surface-1 shadow-float">
      {unlocks.map((unlock) => (
        <UnlockRow
          key={unlock.achievementId}
          unlock={unlock}
          when={unlock.unlockedAt ? formatUnlockDate(unlock.unlockedAt) : 'Date unknown'}
          onOpenGame={onOpenGame}
        />
      ))}
    </ul>
  )
}
