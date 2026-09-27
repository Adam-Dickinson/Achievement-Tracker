export interface UnlockDay<Item> {
  readonly key: string
  readonly date: Date
  readonly unlocks: Item[]
}

export function groupByDay<Item extends { readonly unlockedAt: Date }>(
  unlocks: readonly Item[],
): UnlockDay<Item>[] {
  const days: UnlockDay<Item>[] = []
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
