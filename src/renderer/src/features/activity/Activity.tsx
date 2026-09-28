import { Plug } from 'lucide-react'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { UnlockRow } from '@/components/UnlockRow'
import { useDashboardStats } from '@/features/dashboard/useDashboardStats'
import { formatDayHeading, formatTime, plural } from '@/lib/format'
import { ActivityHeader } from './ActivityHeader'
import { groupByDay } from './groupByDay'
import { PlatinumRow } from './PlatinumRow'
import { useActivity } from './useActivity'

interface ActivityProps {
  onOpenGame: (id: number, platformGameId?: number) => void
  onOpenAccounts: () => void
}

export function Activity({ onOpenGame, onOpenAccounts }: ActivityProps) {
  const stats = useDashboardStats()

  return (
    <div className="mx-auto flex max-w-270 flex-col">
      <ActivityHeader stats={stats} />
      <ActivityDays onOpenGame={onOpenGame} onOpenAccounts={onOpenAccounts} />
    </div>
  )
}

function ActivityDays({ onOpenGame, onOpenAccounts }: ActivityProps) {
  const { page, canShowMore, showMore } = useActivity()

  if (!page) {
    return <p role="status">Loading...</p>
  }

  if (page.unlocks.length === 0) {
    return (
      <EmptyState
        icon={<Plug aria-hidden="true" className="size-6" />}
        heading="Nothing unlocked yet"
        body="Connect an account on the Accounts screen, and every unlock will appear here."
        cta="Go to Accounts"
        onAction={onOpenAccounts}
      />
    )
  }

  const now = new Date()

  return (
    <div className="mt-9 flex flex-col gap-9">
      {groupByDay(page.unlocks).map((day) => (
        <section key={day.key} aria-labelledby={`day-${day.key}`} className="flex flex-col gap-3">
          <div className="flex items-end justify-between px-1">
            <h2 id={`day-${day.key}`} className="font-display text-2xl leading-7 font-bold">
              {formatDayHeading(day.date, now)}
              {isRecent(day.date, now) && (
                <span className="ml-3 font-sans text-sm font-semibold text-fg-muted">
                  {formatFullDate(day.date)}
                </span>
              )}
            </h2>
            <p className="text-[13px] text-fg-muted">{plural(day.unlocks.length, 'unlock')}</p>
          </div>
          <ul className="flex flex-col rounded-panel border border-line bg-surface-1 p-2.5 shadow-float">
            {day.unlocks.map((item) =>
              item.kind === 'platinum' ? (
                <PlatinumRow
                  key={`platinum-${item.platformGameId}`}
                  platinum={item}
                  when={formatTime(item.unlockedAt)}
                  onOpenGame={onOpenGame}
                />
              ) : (
                <UnlockRow
                  key={item.achievementId}
                  unlock={item}
                  when={formatTime(item.unlockedAt)}
                  showDescription
                  onOpenGame={onOpenGame}
                />
              ),
            )}
          </ul>
        </section>
      ))}

      {canShowMore && (
        <Button variant="secondary" className="self-center" onClick={showMore}>
          Show more
        </Button>
      )}
    </div>
  )
}

function isRecent(date: Date, now: Date): boolean {
  const heading = formatDayHeading(date, now)
  return heading === 'Today' || heading === 'Yesterday'
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}
