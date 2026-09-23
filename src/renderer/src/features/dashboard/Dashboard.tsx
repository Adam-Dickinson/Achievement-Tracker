import { CompletionHero } from './CompletionHero'
import { StatTile } from './StatTile'
import { useDashboardStats } from './useDashboardStats'

export function Dashboard() {
  const stats = useDashboardStats()

  if (!stats) {
    return <p role="status"> Loading...</p>
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <CompletionHero unlocked={stats.unlockedAchievements} total={stats.totalAchievements} />

      <div className="grid grid-cols-3 gap-6">
        <StatTile label="Games tracked" value={stats.gamesTracked} />
        <StatTile label="Completed games" value={stats.completedGames} />
        <StatTile label="Achievements unlocked this week" value={stats.unlockedThisWeek} />
      </div>
    </div>
  )
}
