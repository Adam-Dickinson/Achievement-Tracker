import type { RecentUnlock } from '@shared/library'

export interface UnlockDay {
  readonly key: string
  readonly date: Date
  readonly unlocks: RecentUnlock[]
}

export function groupByDay(unlocks: readonly RecentUnlock[]): UnlockDay[] {
  const days: UnlockDay[] = []
  for (const unlock of unlocks) {
    const date = unlock.unlockedAt
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    const current = days.at(-1)
    if (current?.key === key) {
      current.unlocks.push(unlock)
    } else {
      days.push({ key, date, unlocks: [unlock] })
    }
  }
  return days
}
