import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playChime } from './chime'

class FakeOscillator {
  frequency = { value: 0 }
  start = vi.fn()
  stop = vi.fn()
  connect = vi.fn(() => this)
}

class FakeGain {
  gain = { value: 0 }
  connect = vi.fn(() => this)
}

class FakeAudioContext {
  currentTime = 0
  destination = {}
  close = vi.fn()
  oscillators: FakeOscillator[] = []
  gains: FakeGain[] = []

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator()
    this.oscillators.push(oscillator)
    return oscillator
  }

  createGain(): FakeGain {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }
}

let created: FakeAudioContext[]

beforeEach(() => {
  vi.useFakeTimers()
  created = []
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function AudioContextMock() {
      const context = new FakeAudioContext()
      created.push(context)
      return context
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('playChime', () => {
  it('plays one note for a common unlock', () => {
    playChime('common', 0.6)

    expect(created).toHaveLength(1)
    expect(created[0]?.oscillators).toHaveLength(1)
    expect(created[0]?.oscillators[0]?.frequency.value).toBe(523.25)
  })

  it('plays more notes for a rarer unlock', () => {
    playChime('ultra_rare', 0.6)

    expect(created[0]?.oscillators).toHaveLength(4)
  })

  it('sets the gain to the given volume', () => {
    playChime('rare', 0.3)

    for (const gain of created[0]?.gains ?? []) {
      expect(gain.gain.value).toBe(0.3)
    }
  })

  it('starts and stops every note', () => {
    playChime('uncommon', 0.6)

    for (const oscillator of created[0]?.oscillators ?? []) {
      expect(oscillator.start).toHaveBeenCalledOnce()
      expect(oscillator.stop).toHaveBeenCalledOnce()
    }
  })

  it('closes the context once the chime has finished', () => {
    playChime('common', 0.6)

    expect(created[0]?.close).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(created[0]?.close).toHaveBeenCalledOnce()
  })

  it('plays nothing when muted', () => {
    playChime('common', 0)

    expect(created).toHaveLength(0)
  })
})
