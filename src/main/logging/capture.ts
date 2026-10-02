import { format } from 'node:util'
import type { LogLevel } from '@shared/logs'
import type { Logger } from './logger'

type Method = 'debug' | 'log' | 'info' | 'warn' | 'error'
type ConsoleTarget = Pick<Console, Method>
type LogSink = Pick<Logger, 'log'>

interface ProcessEvents {
  on(event: 'uncaughtExceptionMonitor', listener: (error: Error, origin: string) => void): unknown
}

const LEVELS: Record<Method, LogLevel> = {
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
}

function attempt(run: () => void): void {
  try {
    run()
  } catch {
    return
  }
}

export function captureConsole(logger: LogSink, target: ConsoleTarget = console): () => void {
  const methods = Object.keys(LEVELS) as Method[]
  const originals = methods.map((method) => ({ method, original: target[method] }))
  for (const { method, original } of originals) {
    target[method] = (...args: unknown[]): void => {
      attempt(() => logger.log(LEVELS[method], format(...args)))
      original.call(target, ...args)
    }
  }
  return () => {
    for (const { method, original } of originals) target[method] = original
  }
}

export function captureUncaught(logger: LogSink, proc: ProcessEvents = process): void {
  proc.on('uncaughtExceptionMonitor', (error, origin) => {
    attempt(() => logger.log('error', `Uncaught exception (${origin})`, error))
  })
}
