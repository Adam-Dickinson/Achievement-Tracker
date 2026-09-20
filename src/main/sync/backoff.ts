// Sync engine building blocks (docs/SPEC.md §5). Planned for M1: a scheduler (one supervised
// task per account), a diff engine that applies the baseline rule (the first sync of a game
// emits no events), and a running-game detector (M2).

const MAX_EXPONENT = 16

/** Exponential backoff: `baseMs * 2^attempt`, capped at `maxMs`. Callers add jitter. */
export function backoffDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const exponent = Math.min(Math.max(attempt, 0), MAX_EXPONENT)
  return Math.min(baseMs * 2 ** exponent, maxMs)
}
