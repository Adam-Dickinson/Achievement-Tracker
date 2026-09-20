import { describe, expect, it } from 'vitest'
import { backoffDelayMs } from './backoff'

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
