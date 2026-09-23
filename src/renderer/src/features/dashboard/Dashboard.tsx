import { GameCard } from '@/components/GameCard'
import { CompletionHero } from './CompletionHero'
import { RecentUnlocks } from './RecentUnlocks'
import { StatTile } from './StatTile'
import { useDashboardStats } from './useDashboardStats'

interface DashboardProps {
  onOpenGame: (id: number) => void
}

export function Dashboard({ onOpenGame }: DashboardProps) {
  const stats = useDashboardStats()

  if (!stats) {
    return <p role="status">Loading...</p>
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <CompletionHero unlocked={stats.unlockedAchievements} total={stats.totalAchievements} />

      <div className="grid grid-cols-3 gap-6">
        <StatTile label="Games tracked" value={stats.gamesTracked} />
        <StatTile label="Completed games" value={stats.completedGames} />
        <StatTile label="Achievements unlocked this week" value={stats.unlockedThisWeek} />
      </div>

      {stats.nearlyThere.length > 0 && (
        <section aria-labelledby="nearly-there" className="flex flex-col gap-4">
          <div>
            <h2 id="nearly-there" className="font-display text-2xl font-bold">
              Nearly there
            </h2>
            <p className="text-sm text-fg-muted">The games closest to 100%</p>
          </div>
          <ul className="grid grid-cols-4 gap-5">
            {stats.nearlyThere.map((game) => (
              <li key={game.id} className="flex">
                <GameCard game={game} onOpen={onOpenGame} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="recent-unlocks" className="flex flex-col gap-4">
        <h2 id="recent-unlocks" className="font-display text-2xl font-bold">
          Recent unlocks
        </h2>
        <RecentUnlocks unlocks={stats.recentUnlocks} onOpenGame={onOpenGame} />
      </section>
    </div>
  )
}
