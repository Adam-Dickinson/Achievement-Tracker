import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { LOG_LEVEL_RANK, type LogLevel } from '@shared/logs'
import { redactText, redactValue } from './redact'

export const LOG_FILE = 'trophy-locker.log'
export const DEFAULT_MAX_BYTES = 1024 * 1024
export const DEFAULT_KEEP = 5

function fileName(index: number): string {
  return index === 0 ? LOG_FILE : `trophy-locker.${index}.log`
}

export function logFileNames(keep: number = DEFAULT_KEEP): string[] {
  return Array.from({ length: keep }, (_, index) => fileName(index))
}

export interface LoggerOptions {
  readonly dir: string
  readonly level?: LogLevel
  readonly now?: () => Date
  readonly maxBytes?: number
  readonly keep?: number
  readonly onProblem?: (problem: unknown) => void
}

export class Logger {
  readonly #dir: string
  readonly #now: () => Date
  readonly #maxBytes: number
  readonly #keep: number
  readonly #onProblem: (problem: unknown) => void
  #level: LogLevel
  #queue: Promise<void> = Promise.resolve()
  #size: number | null = null
  #reported = false

  constructor({
    dir,
    level = 'info',
    now = () => new Date(),
    maxBytes = DEFAULT_MAX_BYTES,
    keep = DEFAULT_KEEP,
    onProblem = () => undefined,
  }: LoggerOptions) {
    this.#dir = dir
    this.#level = level
    this.#now = now
    this.#maxBytes = maxBytes
    this.#keep = keep
    this.#onProblem = onProblem
  }

  get level(): LogLevel {
    return this.#level
  }

  setLevel(level: LogLevel): void {
    this.#level = level
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data)
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data)
  }

  log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK[this.#level]) return
    const entry = {
      time: this.#now().toISOString(),
      level,
      message: redactText(message),
      ...(data === undefined ? {} : { data: redactValue(data) }),
    }
    let line: string
    try {
      line = `${JSON.stringify(entry)}\n`
    } catch {
      return
    }
    this.#queue = this.#queue.then(() => this.#append(line))
  }

  flush(): Promise<void> {
    return this.#queue
  }

  async #append(line: string): Promise<void> {
    try {
      await mkdir(this.#dir, { recursive: true })
      const bytes = Buffer.byteLength(line)
      const size = this.#size ?? (await this.#currentSize())
      if (size > 0 && size + bytes > this.#maxBytes) {
        await this.#rotate()
        this.#size = 0
      } else {
        this.#size = size
      }
      await appendFile(join(this.#dir, LOG_FILE), line)
      this.#size = (this.#size ?? 0) + bytes
    } catch (problem) {
      this.#size = null
      this.#report(problem)
    }
  }

  async #currentSize(): Promise<number> {
    try {
      return (await stat(join(this.#dir, LOG_FILE))).size
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
      throw error
    }
  }

  async #rotate(): Promise<void> {
    await rm(join(this.#dir, fileName(this.#keep - 1)), { force: true })
    for (let index = this.#keep - 2; index >= 0; index--) {
      try {
        await rename(join(this.#dir, fileName(index)), join(this.#dir, fileName(index + 1)))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.#report(error)
      }
    }
  }

  #report(problem: unknown): void {
    if (this.#reported) return
    this.#reported = true
    this.#onProblem(problem)
  }
}
