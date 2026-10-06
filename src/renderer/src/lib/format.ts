const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function formatPercent(percent: number): string {
  const scale = percent < 1 ? 100 : 10
  return `${Math.round(percent * scale) / scale}%`
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatUnlockDay(date: Date, now = new Date()): string {
  const days = daysBefore(date, now)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatUnlockDate(date: Date, now = new Date()): string {
  const day = formatUnlockDay(date, now)
  return daysBefore(date, now) < 2 ? `${day}, ${formatTime(date)}` : day
}

export function formatAgo(date: Date, now = new Date()): string {
  const elapsed = now.getTime() - date.getTime()
  if (elapsed < MINUTE_MS) return 'just now'
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`
  return `${Math.floor(elapsed / DAY_MS)}d ago`
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

const HOUR_SECONDS = 3600

export function formatPlaytime(seconds: number, partial = false): string {
  const hours = Math.floor(seconds / HOUR_SECONDS)
  const text = hours >= 1 ? `${hours.toLocaleString()}h` : `${Math.floor(seconds / 60)}m`
  return partial ? `${text}+` : text
}

export function describePlaytime(seconds: number, partial = false): string {
  const hours = Math.floor(seconds / HOUR_SECONDS)
  const amount = hours >= 1 ? plural(hours, 'hour') : plural(Math.floor(seconds / 60), 'minute')
  return `${amount} played${partial ? ', may be incomplete' : ''}`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}
