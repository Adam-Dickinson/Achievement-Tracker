export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function seededPick<T>(pool: readonly T[], count: number, seed: string): T[] {
  if (pool.length <= count) return [...pool]
  const random = mulberry32(hash(seed))
  const indices = pool.map((_, i) => i)
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (indices.length - i))
    ;[indices[i], indices[j]] = [indices[j] as number, indices[i] as number]
  }
  return indices
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((i) => pool[i] as T)
}

function hash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
