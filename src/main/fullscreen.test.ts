import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  chooseDelivery,
  NotificationStateReader,
  stateFromWindows,
  type NotificationState,
} from './fullscreen'

describe('stateFromWindows', () => {
  it.each([
    [1, 'not-present'],
    [2, 'busy'],
    [3, 'exclusive-fullscreen'],
    [4, 'presentation'],
    [5, 'normal'],
    [6, 'quiet-time'],
    [7, 'app'],
    [0, 'unknown'],
    [8, 'unknown'],
    [null, 'unknown'],
  ] as const)('maps %s to %s', (value, state) => {
    expect(stateFromWindows(value)).toBe(state)
  })
})

describe('chooseDelivery', () => {
  const states: NotificationState[] = [
    'normal',
    'busy',
    'presentation',
    'quiet-time',
    'not-present',
    'app',
    'unknown',
  ]

  it('uses a Windows notification for exclusive full-screen when the fallback is on', () => {
    expect(chooseDelivery('exclusive-fullscreen', true)).toBe('native')
  })

  it('keeps the overlay for exclusive full-screen when the fallback is off', () => {
    expect(chooseDelivery('exclusive-fullscreen', false)).toBe('overlay')
  })

  it.each(states)('keeps the overlay while %s', (state) => {
    expect(chooseDelivery(state, true)).toBe('overlay')
  })
})

describe('NotificationStateReader', () => {
  let warn: MockInstance

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('answers unknown before it has started', () => {
    const load = vi.fn(() => Promise.resolve(() => 3))

    expect(new NotificationStateReader(load).read()).toBe('unknown')
    expect(load).not.toHaveBeenCalled()
  })

  it('asks Windows on every read once started', async () => {
    const query = vi.fn<() => number | null>().mockReturnValueOnce(5).mockReturnValueOnce(3)
    const reader = new NotificationStateReader(() => Promise.resolve(query))
    await reader.start()

    expect(reader.read()).toBe('normal')
    expect(reader.read()).toBe('exclusive-fullscreen')
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('answers unknown and logs once when the native call cannot be loaded', async () => {
    const reader = new NotificationStateReader(() => Promise.reject(new Error('no koffi')))
    await reader.start()

    expect(reader.read()).toBe('unknown')
    expect(reader.read()).toBe('unknown')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no koffi'))
  })

  it('answers unknown when the call throws', async () => {
    const reader = new NotificationStateReader(() =>
      Promise.resolve(() => {
        throw new Error('access violation')
      }),
    )
    await reader.start()

    expect(reader.read()).toBe('unknown')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('access violation'))
  })

  it('answers unknown when the call reports a failure', async () => {
    const reader = new NotificationStateReader(() => Promise.resolve(() => null))
    await reader.start()

    expect(reader.read()).toBe('unknown')
  })

  it.runIf(process.platform === 'win32')('reads a real state from Windows', async () => {
    const reader = new NotificationStateReader()
    await reader.start()

    expect(reader.read()).not.toBe('unknown')
    expect(warn).not.toHaveBeenCalled()
  })
})
