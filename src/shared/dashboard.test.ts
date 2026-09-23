import { describe, expect, it } from 'vitest'
import { completionPercent } from './dashboard'

describe('completionPercent', () => {
  it.each([
    [3482, 5120, 68],
    [996, 1000, 99], // a plain unlocked/total*100 would give 99.6 -> floors to 99, not 100
    [29, 100, 29], // (29 / 100) * 100 is 28.999999999999996 in floating point; must still read 29
    [5120, 5120, 100],
  ])('%i of %i unlocked is %i%%', (unlocked, total, expected) => {
    expect(completionPercent(unlocked, total)).toBe(expected)
  })

  it('never reports 100% unless every achievement is unlocked', () => {
    expect(completionPercent(9999, 10000)).toBe(99)
  })

  it('is 0 for an empty library instead of NaN', () => {
    expect(completionPercent(0, 0)).toBe(0)
  })

  it('caps at 100 even if unlocked somehow exceeds total', () => {
    expect(completionPercent(130, 100)).toBe(100)
  })
})
