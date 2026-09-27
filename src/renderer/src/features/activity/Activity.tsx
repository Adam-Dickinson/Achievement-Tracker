import { Button } from '@/components/Button'
import { UnlockRow } from '@/components/UnlockRow'
import { formatDayHeading, formatTime, plural } from '@/lib/format'
import { groupByDay } from './groupByDay'
import { PlatinumRow } from './PlatinumRow'
import { useActivity } from './useActivity'

interface ActivityProps {
  onOpenGame: (id: number, platformGameId?: number) => void
}

export function Activity({ onOpenGame }: ActivityProps) {
  const { page, canShowMore, showMore } = useActivity()

  if (!page) {
    return <p role="status">Loading...</p>
  }

  if (page.unlocks.length === 0) {
    return (
      <p className="mt-8 text-fg-muted">
        Nothing unlocked yet. Connect an account on the Accounts screen, and every unlock will
        appear here.
      </p>
    )
  }

  const now = new Date()

  return (
    <div className="mt-8 flex flex-col gap-8">
      {groupByDay(page.unlocks).map((day) => (
        <section key={day.key} aria-labelledby={`day-${day.key}`} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id={`day-${day.key}`} className="font-display text-2xl font-bold">
              {formatDayHeading(day.date, now)}
            </h2>
            <p className="text-sm text-fg-muted">{plural(day.unlocks.length, 'unlock')}</p>
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
