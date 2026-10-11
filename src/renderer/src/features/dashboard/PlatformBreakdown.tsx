import { PlatformBadge } from '@/components/PlatformBadge'
import { formatShare } from '@/lib/format'
import { completionPercent, type PlatformProgress } from '@shared/dashboard'
import { platformName } from '@shared/platform'

interface PlatformBreakdownProps {
  platforms: readonly PlatformProgress[]
}

export function PlatformBreakdown({ platforms }: PlatformBreakdownProps) {
  const anyCovered = platforms.some((progress) => progress.covered > 0)
  return (
    <div className="flex flex-col gap-5 rounded-panel border border-line bg-surface-1 p-6 shadow-float">
      <ul className="flex flex-col gap-5">
        {platforms.map((progress) => (
          <PlatformRow key={progress.platform} progress={progress} />
        ))}
      </ul>
      {anyCovered && <Legend />}
    </div>
  )
}

function PlatformRow({ progress }: { progress: PlatformProgress }) {
  const name = platformName(progress.platform)
  const done = progress.unlocked + progress.covered
  return (
    <li className="flex items-center gap-3">
      <PlatformBadge platform={progress.platform} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="truncate font-semibold">{name}</span>
          <span className="text-fg-muted">
            <b className="font-semibold text-fg">{progress.unlocked.toLocaleString()}</b>
            {progress.covered > 0 && (
              <span className="font-semibold text-aurora-teal">
                {' '}
                +{progress.covered.toLocaleString()}
              </span>
            )}{' '}
            / {progress.total.toLocaleString()}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${name} completion`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completionPercent(done, progress.total)}
          aria-valuetext={
            progress.covered > 0
              ? `${formatShare(done, progress.total)}, ${progress.covered.toLocaleString()} of them done on another platform`
              : undefined
          }
          className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/9"
        >
          {progress.covered > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-aurora-teal/70"
              style={{ width: `${completionPercent(done, progress.total)}%` }}
            />
          )}
          <div
            className="relative h-full rounded-full bg-linear-to-r from-primary/75 to-primary shadow-glow-primary"
            style={{ width: `${completionPercent(progress.unlocked, progress.total)}%` }}
          />
        </div>
      </div>
      <span className="w-12 text-right text-[13px] font-semibold">
        {formatShare(done, progress.total)}
      </span>
    </li>
  )
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
        Unlocked here
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-aurora-teal/70" />
        Done on another platform
      </span>
    </p>
  )
}
