export const MINUTES_PER_DAY = 24 * 60

export interface QuietHours {
  readonly enabled: boolean
  readonly start: number
  readonly end: number
}

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, start: 22 * 60, end: 7 * 60 }

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isQuietTime(quietHours: QuietHours, at: Date): boolean {
  const { enabled, start, end } = quietHours
  if (!enabled || start === end) return false
  const minute = at.getHours() * 60 + at.getMinutes()
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}

export function timeToMinutes(time: string): number | null {
  const match = TIME.exec(time)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
