import type { DayCount } from '@shared/dashboard'

const WEEK_DAYS = 7

export interface DayStats {
  readonly today: number
  readonly week: DayCount[]
  readonly streak: number
}

export function dayStats(unlockTimes: readonly Date[], now: Date): DayStats {
  const perDay = new Map<string, number>()
  for (const time of unlockTimes) {
    const key = dayKey(time)
    perDay.set(key, (perDay.get(key) ?? 0) + 1)
  }
  const countOn = (date: Date) => perDay.get(dayKey(date)) ?? 0

  const week = Array.from({ length: WEEK_DAYS }, (_, i) => {
    const date = daysBefore(now, WEEK_DAYS - 1 - i)
    return { date, count: countOn(date) }
  })

  let streak = 0
  let day = countOn(now) > 0 ? daysBefore(now, 0) : daysBefore(now, 1)
  while (countOn(day) > 0) {
    streak++
    day = daysBefore(day, 1)
  }

  return { today: countOn(now), week, streak }
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - days)
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
