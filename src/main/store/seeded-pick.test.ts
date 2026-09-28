import { describe, expect, it } from 'vitest'
import { dayKey, seededPick } from './seeded-pick'

describe('dayKey', () => {
  it('is the same for two times on the same local day', () => {
    expect(dayKey(new Date(2026, 8, 23, 0, 1))).toBe(dayKey(new Date(2026, 8, 23, 23, 59)))
  })

  it('differs across a day boundary', () => {
    expect(dayKey(new Date(2026, 8, 23, 23, 59))).not.toBe(dayKey(new Date(2026, 8, 24, 0, 1)))
  })
})

describe('seededPick', () => {
  const pool = Array.from({ length: 10 }, (_, i) => i)

  it('returns the whole pool, unchanged, when there are not more items than asked for', () => {
    expect(seededPick(['a', 'b'], 4, 'any-seed')).toEqual(['a', 'b'])
    expect(seededPick(['a', 'b', 'c'], 3, 'any-seed')).toEqual(['a', 'b', 'c'])
    expect(seededPick([], 4, 'any-seed')).toEqual([])
  })

  it('picks the requested count of distinct items from the pool', () => {
    const picked = seededPick(pool, 4, 'seed-a')
    expect(picked).toHaveLength(4)
    expect(new Set(picked).size).toBe(4)
    for (const item of picked) expect(pool).toContain(item)
  })

  it('keeps the picked items in their original pool order', () => {
    const picked = seededPick(pool, 4, 'seed-a')
    const indices = picked.map((item) => pool.indexOf(item))
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })

  it('is deterministic for the same seed', () => {
    expect(seededPick(pool, 4, 'same-seed')).toEqual(seededPick(pool, 4, 'same-seed'))
  })

  it('varies the pick across different seeds', () => {
    const picks = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(seededPick(pool, 1, `seed-${i}`))),
    )
    expect(picks.size).toBeGreaterThan(1)
  })
})
