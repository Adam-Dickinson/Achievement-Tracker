// Retry delays for the sync Scheduler (scheduler.ts, docs/SPEC.md §5).

const MAX_EXPONENT = 16

/** Exponential backoff: `baseMs * 2^attempt`, capped at `maxMs`. Callers add jitter. */
export function backoffDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const exponent = Math.min(Math.max(attempt, 0), MAX_EXPONENT)
  return Math.min(baseMs * 2 ** exponent, maxMs)
}

/** Most jitter adds, as a share of the delay. */
export const JITTER_RATIO = 0.2

/**
 * Adds up to JITTER_RATIO of the delay at random, so games that failed together don't all retry
 * at the same moment. Never shortens it, so a platform's retry-after is still respected.
 */
export function withJitter(delayMs: number, random: () => number = Math.random): number {
  return delayMs + Math.floor(delayMs * JITTER_RATIO * random())
}
