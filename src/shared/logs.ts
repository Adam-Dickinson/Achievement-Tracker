export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

export const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export const MAX_LOG_ENTRIES = 500

export interface LogEntry {
  readonly time: string
  readonly level: LogLevel
  readonly message: string
  readonly data?: unknown
}

export interface LogSettings {
  readonly level: LogLevel
}

export interface StartupSettings {
  readonly available: boolean
  readonly enabled: boolean
}
