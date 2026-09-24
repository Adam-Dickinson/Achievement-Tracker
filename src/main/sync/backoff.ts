const MAX_EXPONENT = 16

export function backoffDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const exponent = Math.min(Math.max(attempt, 0), MAX_EXPONENT)
  return Math.min(baseMs * 2 ** exponent, maxMs)
}

export const JITTER_RATIO = 0.2

export function withJitter(delayMs: number, random: () => number = Math.random): number {
  return delayMs + Math.floor(delayMs * JITTER_RATIO * random())
}
