import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playChime } from './chime'

class FakeOscillator {
  type = ''
  frequency = { value: 0 }
  start = vi.fn()
  stop = vi.fn()
  connect = vi.fn(() => this)
}

class FakeGain {
  peak = 0
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((value: number) => {
      this.peak = Math.max(this.peak, value)
    }),
    exponentialRampToValueAtTime: vi.fn(),
  }
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
    expect(created[0]?.oscillators[0]?.frequency.value).toBe(659.25)
  })

  it('plays more notes for a rarer unlock', () => {
    playChime('ultra_rare', 0.6)

    expect(created[0]?.oscillators).toHaveLength(4)
  })

  it('ramps the gain up to the given volume for each note', () => {
    playChime('rare', 0.3)

    for (const gain of created[0]?.gains ?? []) {
      expect(gain.peak).toBe(0.3)
    }
  })

  it('plays a triangle wave', () => {
    playChime('common', 0.6)

    expect(created[0]?.oscillators[0]?.type).toBe('triangle')
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
