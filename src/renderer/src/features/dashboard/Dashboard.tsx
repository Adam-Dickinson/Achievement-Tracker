import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PageId } from '@/app/navigation'
import { GameCard } from '@/components/GameCard'
import type { DashboardStats } from '@shared/dashboard'
import { DashboardHero } from './DashboardHero'
import { PlatformBreakdown } from './PlatformBreakdown'
import { RarestUnlockCard } from './RarestUnlockCard'
import { UnlockList } from './UnlockList'
import { useDashboardStats } from './useDashboardStats'
import { WeekChart } from './WeekChart'

interface DashboardProps {
  onOpenGame: (id: number, platformGameId?: number) => void
  onNavigate: (page: PageId) => void
}

export function Dashboard({ onOpenGame, onNavigate }: DashboardProps) {
  const stats = useDashboardStats()

  return (
    <div className="flex flex-col gap-14">
      <h1 className="sr-only">Dashboard</h1>
      {stats ? (
        <DashboardContent stats={stats} onOpenGame={onOpenGame} onNavigate={onNavigate} />
      ) : (
        <p role="status">Loading...</p>
      )}
    </div>
  )
}

function DashboardContent({
  stats,
  onOpenGame,
  onNavigate,
}: DashboardProps & { stats: DashboardStats }) {
  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        <DashboardHero
          stats={stats}
          onOpenGame={onOpenGame}
          className="col-span-12 xl:col-span-8"
        />
        <RarestUnlockCard
          unlock={stats.rarestUnlock}
          onOpenGame={onOpenGame}
          className="col-span-12 xl:col-span-4"
        />
      </div>

      {stats.nearlyThere.length > 0 && (
        <Section
          id="nearly-there"
          title="Nearly there"
          subtitle="The games closest to 100%"
          action={{ label: 'Library', onClick: () => onNavigate('library') }}
        >
          <ul className="grid grid-cols-4 items-start gap-6">
            {stats.nearlyThere.map((game) => (
              <li key={game.id} className="flex">
                <GameCard game={game} onOpen={onOpenGame} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid grid-cols-12 items-start gap-6">
        <Section
          id="recent-unlocks"
          title="Recent unlocks"
          action={{ label: 'All activity', onClick: () => onNavigate('activity') }}
          className="col-span-12 xl:col-span-7"
        >
          {stats.recentUnlocks.length === 0 ? (
            <p className="text-fg-muted">Nothing unlocked yet. New unlocks appear here.</p>
          ) : (
            <UnlockList unlocks={stats.recentUnlocks} onOpenGame={onOpenGame} />
          )}
        </Section>

        <div className="col-span-12 flex flex-col gap-6 xl:col-span-5">
          {stats.platforms.length > 0 && (
            <Section
              id="platforms"
              title="Platforms"
              action={{ label: 'Accounts', onClick: () => onNavigate('accounts') }}
            >
              <PlatformBreakdown platforms={stats.platforms} />
            </Section>
          )}
          <Section id="this-week" title="This week">
            <WeekChart week={stats.week} />
          </Section>
        </div>
      </div>
    </>
  )
}

interface SectionProps {
  id: string
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void }
  className?: string
  children: ReactNode
}

function Section({ id, title, subtitle, action, className = '', children }: SectionProps) {
  return (
    <section aria-labelledby={id} className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id={id} className="font-display text-2xl leading-7 font-bold">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-fg-muted">{subtitle}</p>}
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="flex items-center gap-1 rounded-full bg-white/6 px-3.5 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-white/10 hover:text-fg"
          >
            {action.label}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
