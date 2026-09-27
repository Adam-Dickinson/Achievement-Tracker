import { UnlockRow } from '@/components/UnlockRow'
import { formatDayLabel, formatTime } from '@/lib/format'
import type { UnlockedAchievement } from '@shared/library'

interface UnlockListProps {
  unlocks: readonly UnlockedAchievement[]
  onOpenGame: (id: number, platformGameId?: number) => void
}

export function UnlockList({ unlocks, onOpenGame }: UnlockListProps) {
  return (
    <ul className="flex flex-col rounded-panel border border-line bg-surface-1 p-2.5 shadow-float">
      {unlocks.map((unlock) => (
        <UnlockRow
          key={unlock.achievementId}
          unlock={unlock}
          day={unlock.unlockedAt ? formatDayLabel(unlock.unlockedAt) : undefined}
          when={unlock.unlockedAt ? formatTime(unlock.unlockedAt) : 'Date unknown'}
          onOpenGame={onOpenGame}
        />
      ))}
    </ul>
  )
}
