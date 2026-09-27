import { plural } from '@/lib/format'
import type { DayCount } from '@shared/dashboard'

const BAR_MIN_PX = 14
const BAR_RANGE_PX = 90

interface WeekChartProps {
  week: readonly DayCount[]
}

export function WeekChart({ week }: WeekChartProps) {
  const total = week.reduce((sum, day) => sum + day.count, 0)
  const most = Math.max(1, ...week.map((day) => day.count))
  const best = week.reduce<DayCount | null>(
    (top, day) => (top === null || day.count > top.count ? day : top),
    null,
  )

  return (
    <div className="rounded-panel border border-line bg-surface-1 p-6 shadow-float">
      <ol className="flex items-end gap-2">
        {week.map((day, i) => {
          const today = i === week.length - 1
          return (
            <li
              key={day.date.getTime()}
              aria-label={`${weekday(day.date, 'long')}: ${plural(day.count, 'unlock')}`}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-26 w-full items-end justify-center">
                <span
                  className={`block w-7.5 rounded-full ${
                    today
                      ? 'bg-linear-to-b from-primary-hover to-primary shadow-glow-primary'
                      : 'bg-white/14'
                  }`}
                  style={{ height: BAR_MIN_PX + (day.count / most) * BAR_RANGE_PX }}
                />
              </div>
              <span
                aria-hidden="true"
                className={`text-xs font-semibold ${today ? 'text-primary' : 'text-fg-muted'}`}
              >
                {weekday(day.date, 'narrow')}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 flex items-center justify-between border-t border-line pt-4 text-[13px] text-fg-muted">
        {total === 0 || best === null ? (
          'No unlocks in the last 7 days'
        ) : (
          <>
            <span>
              Best day{' '}
              <b className="text-fg">
                {weekday(best.date, 'long')} · {best.count}
              </b>
            </span>
            <span>
              Daily avg <b className="text-fg">{(total / week.length).toFixed(1)}</b>
            </span>
          </>
        )}
      </p>
    </div>
  )
}

function weekday(date: Date, style: 'long' | 'narrow'): string {
  return date.toLocaleDateString(undefined, { weekday: style })
}
