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
