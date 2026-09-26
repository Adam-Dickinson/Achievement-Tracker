import { plural } from '@/lib/format'
import { completionPercent, type PlatformProgress } from '@shared/dashboard'
import { platformName } from '@shared/platform'

interface PlatformBreakdownProps {
  platforms: readonly PlatformProgress[]
}

export function PlatformBreakdown({ platforms }: PlatformBreakdownProps) {
  return (
    <ul className="grid grid-cols-3 gap-4">
      {platforms.map((progress) => {
        const name = platformName(progress.platform)
        const percent = completionPercent(progress.unlocked, progress.total)
        return (
          <li
            key={progress.platform}
            className="flex flex-col gap-3 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold">{name}</span>
              <span className="font-display text-xl font-bold tabular-nums">{percent}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={`${name} completion`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-1.5 overflow-hidden rounded-full bg-surface-3"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <span className="flex justify-between gap-2 text-xs text-fg-muted">
              <span>
                {progress.unlocked.toLocaleString()} / {progress.total.toLocaleString()}{' '}
                achievements
              </span>
              <span>{plural(progress.games, 'game')}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
