const DAY_MS = 24 * 60 * 60_000

export function formatPercent(percent: number): string {
  const scale = percent < 1 ? 100 : 10
  return `${Math.round(percent * scale) / scale}%`
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatUnlockDate(date: Date, now = new Date()): string {
  const days = daysBefore(date, now)
  if (days === 0) return `Today, ${formatTime(date)}`
  if (days === 1) return `Yesterday, ${formatTime(date)}`
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatShare(done: number, total: number): string {
  if (total <= 0) return '0%'
  if (done >= total) return '100%'
  const tenths = Math.floor((done * 1000) / total) / 10
  return `${tenths.toFixed(1)}%`
}

export function formatDayLabel(date: Date, now = new Date()): string {
  const days = daysBefore(date, now)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'short' })
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function formatDayHeading(date: Date, now = new Date()): string {
  const days = daysBefore(date, now)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function daysBefore(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}
