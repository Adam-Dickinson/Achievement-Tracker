import type { ReactNode } from 'react'
import { GameCard } from '@/components/GameCard'
import { CompletionHero } from './CompletionHero'
import { PlatformBreakdown } from './PlatformBreakdown'
import { StatTile } from './StatTile'
import { UnlockList } from './UnlockList'
import { useDashboardStats } from './useDashboardStats'

interface DashboardProps {
  onOpenGame: (id: number, platformGameId?: number) => void
}

export function Dashboard({ onOpenGame }: DashboardProps) {
  const stats = useDashboardStats()

  if (!stats) {
    return <p role="status">Loading...</p>
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <CompletionHero unlocked={stats.unlockedAchievements} total={stats.totalAchievements} />

      <div className="grid grid-cols-4 gap-6">
        <StatTile label="Games tracked" value={stats.gamesTracked} />
        <StatTile label="Completed games" value={stats.completedGames} />
        <StatTile label="Platinums" value={stats.platinums} />
        <StatTile label="Achievements unlocked this week" value={stats.unlockedThisWeek} />
      </div>

      {stats.platforms.length > 0 && (
        <Section id="platforms" title="Platforms" subtitle="Your completion on each platform">
          <PlatformBreakdown platforms={stats.platforms} />
        </Section>
      )}

      {stats.nearlyThere.length > 0 && (
        <Section id="nearly-there" title="Nearly there" subtitle="The games closest to 100%">
          <ul className="grid grid-cols-4 gap-5">
            {stats.nearlyThere.map((game) => (
              <li key={game.id} className="flex">
                <GameCard game={game} onOpen={onOpenGame} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="recent-unlocks" title="Recent unlocks">
        {stats.recentUnlocks.length === 0 ? (
          <p className="text-fg-muted">Nothing unlocked yet. New unlocks appear here.</p>
        ) : (
          <UnlockList unlocks={stats.recentUnlocks} onOpenGame={onOpenGame} />
        )}
      </Section>

      {stats.rarestUnlocks.length > 0 && (
        <Section
          id="rarest-unlocks"
          title="Rarest unlocked"
          subtitle="The achievements you hold that the fewest players have"
        >
          <UnlockList unlocks={stats.rarestUnlocks} onOpenGame={onOpenGame} />
        </Section>
      )}
    </div>
  )
}

interface SectionProps {
  id: string
  title: string
  subtitle?: string
  children: ReactNode
}

function Section({ id, title, subtitle, children }: SectionProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div>
        <h2 id={id} className="font-display text-2xl font-bold">
          {title}
        </h2>
        {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}
