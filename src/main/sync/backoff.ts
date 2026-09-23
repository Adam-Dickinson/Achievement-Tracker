// Retry delays for the sync Scheduler (scheduler.ts, docs/SPEC.md §5).

const MAX_EXPONENT = 16

/** Exponential backoff: `baseMs * 2^attempt`, capped at `maxMs`. Callers add jitter. */
export function backoffDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const exponent = Math.min(Math.max(attempt, 0), MAX_EXPONENT)
  return Math.min(baseMs * 2 ** exponent, maxMs)
}
