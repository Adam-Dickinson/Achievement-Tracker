import { CalendarDays, Crown, Flame, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { RarityGem } from '@/components/RarityGem'
import { formatShare, plural } from '@/lib/format'
import { completionPercent, type DashboardStats } from '@shared/dashboard'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'
import { CoverFan } from './CoverFan'
import { greeting } from './greeting'

const RARITIES: readonly Rarity[] = ['ultra_rare', 'rare', 'uncommon', 'common']

const RARITY_CHIP =
  'inline-flex items-center gap-2 rounded-full border border-line bg-white/4 py-1.5 pr-4 pl-3 text-[13px] font-semibold text-(--rarity)'

interface DashboardHeroProps {
  stats: DashboardStats
  onOpenGame: (id: number) => void
  className?: string
}

export function DashboardHero({ stats, onOpenGame, className = '' }: DashboardHeroProps) {
  const { unlockedAchievements: unlocked, totalAchievements: total } = stats
  const percent = completionPercent(unlocked, total)

  return (
    <section
      aria-labelledby="hero-title"
      className={`relative min-h-113 overflow-hidden rounded-panel border border-line bg-surface-1 p-9 shadow-float ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -left-20 h-72 w-104 rounded-full bg-primary/11 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-10 -bottom-32 h-72 w-96 rounded-full bg-rarity-uncommon/12 blur-3xl"
      />

      <div className="relative xl:w-[56%]">
        <p className="text-[15px] font-semibold text-fg-muted">{greeting(new Date())}</p>
        <p
          id="hero-title"
          className="mt-5 text-[13px] font-bold tracking-[0.12em] text-primary uppercase"
        >
          Achievements unlocked
        </p>
        <p className="flex items-end gap-3">
          <span className="font-display text-[132px] leading-[0.95] font-extrabold">
            {unlocked.toLocaleString()}
          </span>
          <span className="pb-5 font-semibold text-fg-muted">of {total.toLocaleString()}</span>
        </p>

        <div className="mt-3 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Achievements unlocked"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-4 flex-1 overflow-hidden rounded-full bg-white/9"
          >
            <div
              className="h-full rounded-full bg-linear-to-r from-primary/75 to-primary shadow-glow-primary"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-sm font-bold">{formatShare(unlocked, total)}</span>
        </div>
        <p className="mt-2 text-[13px] text-fg-muted">
          {(total - unlocked).toLocaleString()} still to go across{' '}
          {plural(stats.gamesTracked, 'game')}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Chip icon={<Plus className="size-3.5 text-primary" />}>{stats.unlockedToday} today</Chip>
          <Chip icon={<CalendarDays className="size-3.5 text-primary" />}>
            {stats.unlockedThisWeek} this week
          </Chip>
          {stats.streakDays > 0 && (
            <Chip icon={<Flame className="size-3.5 text-warning" />}>
              {stats.streakDays}-day streak
            </Chip>
          )}
        </div>

        <div className="mt-7 border-t border-line pt-5">
          <p
            id="by-rarity"
            className="mb-3 text-xs font-bold tracking-[0.12em] text-fg-muted uppercase"
          >
            By rarity
          </p>
          <ul aria-labelledby="by-rarity" className="flex flex-wrap gap-2">
            <li data-platinum="" className={RARITY_CHIP}>
              <Crown aria-hidden="true" className="size-3.25" />
              <b className="font-display text-[17px] font-extrabold text-fg">
                {stats.platinums.toLocaleString()}
              </b>
              <span className="text-fg-muted">Platinum</span>
            </li>
            {RARITIES.map((rarity) => (
              <li key={rarity} data-rarity={rarity} className={RARITY_CHIP}>
                <RarityGem rarity={rarity} className="size-3.25" />
                <b className="font-display text-[17px] font-extrabold text-fg">
                  {stats.unlockedByRarity[rarity].toLocaleString()}
                </b>
                <span className="text-fg-muted">{RARITY_LABEL[rarity]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <CoverFan games={stats.nearlyThere} onOpenGame={onOpenGame} />
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
