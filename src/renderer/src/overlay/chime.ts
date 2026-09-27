import type { Rarity } from '@shared/rarity'

const NOTE_MS = 90
const NOTE_GAP_MS = 10

const NOTES: Readonly<Record<Rarity, readonly number[]>> = {
  common: [523.25],
  uncommon: [523.25, 659.25],
  rare: [523.25, 659.25, 783.99],
  ultra_rare: [523.25, 659.25, 783.99, 1046.5],
}

export function playChime(rarity: Rarity, volume: number): void {
  if (volume <= 0 || typeof AudioContext === 'undefined') return

  const context = new AudioContext()
  const notes = NOTES[rarity]
  const step = (NOTE_MS + NOTE_GAP_MS) / 1000

  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * step
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = frequency
    gain.gain.value = volume
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + NOTE_MS / 1000)
  })

  const totalMs = notes.length * (NOTE_MS + NOTE_GAP_MS)
  setTimeout(() => void context.close(), totalMs)
}
