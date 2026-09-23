/**
 * Wraps `fn` so a burst of calls runs it once, `ms` after the first call of the burst. Used to
 * tell the UI about data changes without refetching once per synced game.
 */
export function coalesce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      fn()
    }, ms)
  }
}
