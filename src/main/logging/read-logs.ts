import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  LOG_LEVEL_RANK,
  LOG_LEVELS,
  MAX_LOG_ENTRIES,
  type LogEntry,
  type LogLevel,
} from '@shared/logs'
import { DEFAULT_KEEP, logFileNames } from './logger'

const entrySchema = z.object({
  time: z.string(),
  level: z.enum(LOG_LEVELS),
  message: z.string(),
  data: z.unknown().optional(),
})

export async function readLogs(
  dir: string,
  minLevel: LogLevel,
  limit: number = MAX_LOG_ENTRIES,
  keep: number = DEFAULT_KEEP,
): Promise<LogEntry[]> {
  const collected: LogEntry[] = []
  for (const name of logFileNames(keep)) {
    const text = await readText(join(dir, name))
    for (const line of text.split('\n').reverse()) {
      const entry = parseLine(line)
      if (entry && LOG_LEVEL_RANK[entry.level] >= LOG_LEVEL_RANK[minLevel]) {
        collected.push(entry)
        if (collected.length >= limit) return collected.reverse()
      }
    }
  }
  return collected.reverse()
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

function parseLine(line: string): LogEntry | null {
  if (line.trim() === '') return null
  try {
    const parsed = entrySchema.safeParse(JSON.parse(line))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
