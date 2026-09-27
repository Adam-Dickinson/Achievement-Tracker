import { PlatformBadge } from '@/components/PlatformBadge'
import { formatShare } from '@/lib/format'
import { completionPercent, type PlatformProgress } from '@shared/dashboard'
import { platformName } from '@shared/platform'

interface PlatformBreakdownProps {
  platforms: readonly PlatformProgress[]
}

export function PlatformBreakdown({ platforms }: PlatformBreakdownProps) {
  return (
    <ul className="flex flex-col gap-5 rounded-panel border border-line bg-surface-1 p-6 shadow-float">
      {platforms.map((progress) => {
        const name = platformName(progress.platform)
        return (
          <li key={progress.platform} className="flex items-center gap-3">
            <PlatformBadge platform={progress.platform} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate font-semibold">{name}</span>
                <span className="text-fg-muted">
                  <b className="font-semibold text-fg">{progress.unlocked.toLocaleString()}</b> /{' '}
                  {progress.total.toLocaleString()}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${name} completion`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completionPercent(progress.unlocked, progress.total)}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/9"
              >
                <div
                  className="h-full rounded-full bg-linear-to-r from-primary/75 to-primary shadow-glow-primary"
                  style={{ width: `${completionPercent(progress.unlocked, progress.total)}%` }}
                />
              </div>
            </div>
            <span className="w-12 text-right text-[13px] font-semibold">
              {formatShare(progress.unlocked, progress.total)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
