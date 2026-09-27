import { CalendarDays, Flame, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { RarityGem } from '@/components/RarityGem'
import { formatPercent } from '@/lib/format'
import type { DashboardStats } from '@shared/dashboard'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'

const RARITIES: readonly Rarity[] = ['ultra_rare', 'rare', 'uncommon', 'common']

export function ActivityHeader({ stats }: { stats: DashboardStats | null }) {
  return (
    <section
      aria-labelledby="activity-title"
      className="relative overflow-hidden rounded-panel border border-line bg-surface-1 bg-linear-to-b from-white/5 to-white/1 p-7 shadow-float"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[13px] font-semibold text-fg-muted">Every platform, newest first</p>
          <h1 id="activity-title" className="font-display text-[46px] leading-12.5 font-extrabold">
            Activity
          </h1>
          {stats && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip icon={<CalendarDays className="size-3.75 text-primary" />}>
                {stats.unlockedThisWeek.toLocaleString()} this week
              </Chip>
              {stats.streakDays > 0 && (
                <Chip icon={<Flame className="size-3.75 text-primary" />}>
                  {stats.streakDays}-day streak
                </Chip>
              )}
              {stats.rarestThisWeek !== null && (
                <Chip icon={<Sparkles className="size-3.75 text-primary" />}>
                  Rarest this week: {formatPercent(stats.rarestThisWeek)}
                </Chip>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <p id="rarity-legend" className="text-xs text-fg-muted">
            Rarity
          </p>
          <ul aria-labelledby="rarity-legend" className="flex flex-wrap items-center gap-3">
            {RARITIES.map((rarity) => (
              <li
                key={rarity}
                data-rarity={rarity}
                className="flex items-center gap-1.5 text-xs font-semibold text-(--rarity)"
              >
                <RarityGem rarity={rarity} className="size-3" />
                {RARITY_LABEL[rarity]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex h-7.5 items-center gap-1.5 rounded-full border border-white/8 bg-white/6 px-3.25 text-[13px] font-semibold whitespace-nowrap">
      <span aria-hidden="true" className="flex">
        {icon}
      </span>
      {children}
    </span>
  )
}
