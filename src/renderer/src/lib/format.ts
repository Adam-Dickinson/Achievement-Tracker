const DAY_MS = 24 * 60 * 60_000

/** "4.3%", or two decimal places below 1% so a very rare achievement doesn't read as 0%. */
export function formatPercent(percent: number): string {
  const scale = percent < 1 ? 100 : 10
  return `${Math.round(percent * scale) / scale}%`
}

/** "Today, 13:42", "Yesterday, 20:31", or a date such as "9 Mar 2026" (in the user's locale). */
export function formatUnlockDate(date: Date, now = new Date()): string {
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "1 game", "2 games". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}
