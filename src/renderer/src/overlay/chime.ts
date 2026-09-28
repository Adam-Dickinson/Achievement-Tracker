import type { Rarity } from '@shared/rarity'

const NOTE_MS = 280
const NOTE_STEP_MS = 110
const ATTACK_MS = 6
const RELEASE_FLOOR = 0.0001

const NOTES: Readonly<Record<Rarity, readonly number[]>> = {
  common: [659.25],
  uncommon: [659.25, 987.77],
  rare: [523.25, 783.99, 1046.5],
  ultra_rare: [523.25, 783.99, 1046.5, 1567.98],
}

export function playChime(rarity: Rarity, volume: number): void {
  if (volume <= 0 || typeof AudioContext === 'undefined') return

  const context = new AudioContext()
  const notes = NOTES[rarity]
  const step = NOTE_STEP_MS / 1000

  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * step
    const end = start + NOTE_MS / 1000
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(volume, start + ATTACK_MS / 1000)
    gain.gain.exponentialRampToValueAtTime(RELEASE_FLOOR, end)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(end)
  })

  const totalMs = (notes.length - 1) * NOTE_STEP_MS + NOTE_MS
  setTimeout(() => void context.close(), totalMs)
}
