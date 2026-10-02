import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { LogLevel } from '@shared/logs'
import { captureConsole, captureUncaught } from './capture'

type Call = [LogLevel, string, unknown?]

function fakes() {
  const calls: Call[] = []
  const logger = {
    log: vi.fn((level: LogLevel, message: string, data?: unknown) => {
      calls.push([level, message, data])
    }),
  }
  const target = {
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  return { calls, logger, target }
}

describe('captureConsole', () => {
  it('writes each console method at its level and still forwards the call', () => {
    const { calls, logger, target } = fakes()
    const original = { ...target }

    captureConsole(logger, target)
    target.debug('d')
    target.log('l')
    target.info('i')
    target.warn('w')
    target.error('e')

    expect(calls.map(([level, message]) => [level, message])).toEqual([
      ['debug', 'd'],
      ['info', 'l'],
      ['info', 'i'],
      ['warn', 'w'],
      ['error', 'e'],
    ])
    expect(original.warn).toHaveBeenCalledWith('w')
    expect(original.error).toHaveBeenCalledWith('e')
  })

  it('formats several arguments like console does', () => {
    const { calls, logger, target } = fakes()

    captureConsole(logger, target)
    target.warn('Stopped watching %s after %d tries', 'C:\\games', 3)

    expect(calls[0]?.[1]).toBe('Stopped watching C:\\games after 3 tries')
  })

  it('keeps the stack of an error argument', () => {
    const { calls, logger, target } = fakes()

    captureConsole(logger, target)
    target.error('Sync failed', new Error('boom'))

    expect(calls[0]?.[1]).toContain('Sync failed')
    expect(calls[0]?.[1]).toContain('Error: boom')
  })

  it('shows an object argument', () => {
    const { calls, logger, target } = fakes()

    captureConsole(logger, target)
    target.info('state', { a: 1 })

    expect(calls[0]?.[1]).toContain('a: 1')
  })

  it('never lets a failing logger break a console call', () => {
    const { logger, target } = fakes()
    logger.log.mockImplementation(() => {
      throw new Error('disk gone')
    })
    const original = { ...target }

    captureConsole(logger, target)

    expect(() => target.error('still prints')).not.toThrow()
    expect(original.error).toHaveBeenCalledWith('still prints')
  })

  it('puts the original methods back when restored', () => {
    const { logger, target } = fakes()
    const originalWarn = target.warn

    const restore = captureConsole(logger, target)
    restore()

    expect(target.warn).toBe(originalWarn)
  })
})

describe('captureUncaught', () => {
  it('logs an uncaught exception as an error, without handling it', () => {
    const { calls, logger } = fakes()
    const proc = new EventEmitter()
    const error = new Error('crash')

    captureUncaught(logger, proc)
    proc.emit('uncaughtExceptionMonitor', error, 'uncaughtException')

    expect(calls).toEqual([['error', 'Uncaught exception (uncaughtException)', error]])
    expect(proc.listenerCount('uncaughtException')).toBe(0)
  })
})
