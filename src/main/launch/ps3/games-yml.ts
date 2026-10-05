export interface GameEntry {
  readonly serial: string
  readonly path: string
}

const LINE = /^([A-Z]{4}\d{5}):\s*(.+)$/

export function parseGamesYml(text: string): GameEntry[] {
  const entries: GameEntry[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const match = LINE.exec(line)
    const serial = match?.[1]
    const value = unquote((match?.[2] ?? '').trim())
    if (serial && value !== '') entries.push({ serial, path: value })
  }
  return entries
}

function unquote(value: string): string {
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    return value.slice(1, -1)
  }
  return value
}
