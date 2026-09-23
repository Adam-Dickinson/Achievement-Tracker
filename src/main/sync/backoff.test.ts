import { describe, expect, it } from 'vitest'
import { backoffDelayMs, JITTER_RATIO, withJitter } from './backoff'

describe('backoffDelayMs', () => {
  it('grows exponentially then caps', () => {
    const base = 5_000
    const max = 300_000

    expect(backoffDelayMs(0, base, max)).toBe(5_000)
    expect(backoffDelayMs(1, base, max)).toBe(10_000)
    expect(backoffDelayMs(3, base, max)).toBe(40_000)
    expect(backoffDelayMs(20, base, max)).toBe(max)
  })
})

describe('withJitter', () => {
  it('adds nothing at the bottom of the range and up to the full ratio at the top', () => {
    expect(withJitter(30_000, () => 0)).toBe(30_000)
    expect(withJitter(30_000, () => 0.5)).toBe(33_000)
    expect(withJitter(30_000, () => 0.999999)).toBeLessThan(30_000 * (1 + JITTER_RATIO))
  })

  it('never shortens the delay', () => {
    for (let i = 0; i < 100; i++) expect(withJitter(10_000)).toBeGreaterThanOrEqual(10_000)
  })
})
