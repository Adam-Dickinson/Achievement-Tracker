import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coalesce } from './coalesce'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('coalesce', () => {
  it('runs once for a burst of calls, after the delay', () => {
    const fn = vi.fn()
    const call = coalesce(fn, 1000)

    call()
    call()
    vi.advanceTimersByTime(999)
    call()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('runs again for a call after the previous run', () => {
    const fn = vi.fn()
    const call = coalesce(fn, 1000)

    call()
    vi.advanceTimersByTime(1000)
    call()
    vi.advanceTimersByTime(1000)

    expect(fn).toHaveBeenCalledTimes(2)
  })
})
