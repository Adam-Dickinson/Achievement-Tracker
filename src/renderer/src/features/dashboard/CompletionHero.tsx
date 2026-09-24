import { completionPercent } from '@shared/dashboard'

interface CompletionHeroProps {
  unlocked: number
  total: number
}

export function CompletionHero({ unlocked, total }: CompletionHeroProps) {
  const percent = completionPercent(unlocked, total)

  return (
    <div className="rounded-panel border border-line bg-surface-1 p-8 shadow-float">
      <p className="text-sm text-fg-muted">Total completion</p>

      <p className="mt-2 font-display text-7xl font-semibold tabular-nums">{percent}%</p>

      <p className="mt-2 text-fg-muted">
        {unlocked.toLocaleString()} / {total.toLocaleString()} achievements unlocked across all
        platforms
      </p>

      <div
        role="progressbar"
        aria-label="Total completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-6 h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
