import { Check, EyeOff, Lock } from 'lucide-react'
import { useState } from 'react'
import { PlatinumChip } from '@/components/PlatinumChip'
import { RarityChip } from '@/components/RarityChip'
import { formatPercent, formatUnlockDate } from '@/lib/format'
import type { GameAchievement } from '@shared/library'
import { rarityFromPercent } from '@shared/rarity'

interface AchievementRowProps {
  achievement: GameAchievement
}

export function AchievementRow({ achievement }: AchievementRowProps) {
  const { unlocked, globalPercent } = achievement
  const secret = achievement.hidden && !unlocked
  const rarity = globalPercent === null ? 'common' : rarityFromPercent(globalPercent)
  const highlight = unlocked && (rarity === 'ultra_rare' || achievement.platinum)

  return (
    <div
      data-rarity={rarity}
      data-platinum={achievement.platinum ? '' : undefined}
      className={`flex w-full items-center gap-4 rounded-panel border bg-surface-1 p-4 shadow-float ${unlocked ? '' : 'opacity-82'} ${
        highlight ? 'border-(--rarity)/60' : 'border-line'
      }`}
    >
      <AchievementIcon
        url={unlocked ? achievement.iconUrl : achievement.iconLockedUrl}
        secret={secret}
        unlocked={unlocked}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className={`truncate font-semibold ${unlocked ? '' : 'text-fg-muted'}`}>
            {secret ? 'Hidden achievement' : achievement.name}
          </p>
          {achievement.platinum && <PlatinumChip className="shrink-0" />}
        </div>
        <p className="truncate text-sm text-fg-muted">
          {secret ? 'The description is revealed once you unlock it.' : achievement.description}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-fg-subtle">
          {unlocked ? (
            <>
              <Check aria-hidden="true" className="size-3 text-success" />
              {achievement.unlockedAt ? formatUnlockDate(achievement.unlockedAt) : 'Unlocked'}
            </>
          ) : (
            <>
              <Lock aria-hidden="true" className="size-3" />
              Locked
            </>
          )}
        </p>
      </div>

      {globalPercent !== null && (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-display text-2xl font-bold">{formatPercent(globalPercent)}</span>
          <RarityChip rarity={rarity} />
        </div>
      )}
    </div>
  )
}

function AchievementIcon({
  url,
  secret,
  unlocked,
}: {
  url: string | null
  secret: boolean
  unlocked: boolean
}) {
  const [failed, setFailed] = useState(false)
  const box = 'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-card'

  if (secret || !url || failed) {
    const Icon = secret ? EyeOff : unlocked ? Check : Lock
    return (
      <div className={`${box} border border-line bg-surface-2 text-fg-subtle`}>
        <Icon aria-hidden="true" className="size-5" />
      </div>
    )
  }
  return (
    <div className={box}>
      <img src={url} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
    </div>
  )
}
