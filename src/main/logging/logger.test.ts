import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger, LOG_FILE, logFileNames } from './logger'

const NOW = new Date('2026-10-02T12:00:00.000Z')

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'logger-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function lines(name = LOG_FILE): Record<string, unknown>[] {
  return readFileSync(join(dir, name), 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

function logger(options: Partial<ConstructorParameters<typeof Logger>[0]> = {}): Logger {
  return new Logger({ dir, now: () => NOW, ...options })
}

describe('logFileNames', () => {
  it('names the current file and the older ones, newest first', () => {
    expect(logFileNames(3)).toEqual([
      'trophy-locker.log',
      'trophy-locker.1.log',
      'trophy-locker.2.log',
    ])
  })
})

describe('Logger', () => {
  it('writes one JSON line per entry', async () => {
    const log = logger()

    log.info('hello', { a: 1 })
    log.warn('careful')
    await log.flush()

    expect(lines()).toEqual([
      { time: '2026-10-02T12:00:00.000Z', level: 'info', message: 'hello', data: { a: 1 } },
      { time: '2026-10-02T12:00:00.000Z', level: 'warn', message: 'careful' },
    ])
  })

  it('creates the folder when it is missing', async () => {
    const log = logger({ dir: join(dir, 'nested', 'logs') })

    log.info('x')
    await log.flush()

    expect(readdirSync(join(dir, 'nested', 'logs'))).toEqual([LOG_FILE])
  })

  it('drops entries below the level, and follows a level change', async () => {
    const log = logger({ level: 'warn' })

    log.info('skipped')
    log.error('kept')
    log.setLevel('debug')
    log.debug('now kept')
    await log.flush()

    expect(log.level).toBe('debug')
    expect(lines().map((entry) => entry.message)).toEqual(['kept', 'now kept'])
  })

  it('redacts the message and the data before writing', async () => {
    const log = logger()

    log.warn('GET /x?token=abc123', { token: 'abc123', n: 1 })
    await log.flush()

    expect(readFileSync(join(dir, LOG_FILE), 'utf8')).not.toContain('abc123')
  })

  it('does not throw on a circular value', async () => {
    const loop: Record<string, unknown> = {}
    loop.self = loop
    const log = logger()

    log.info('loop', loop)
    await log.flush()

    expect(lines()).toHaveLength(1)
  })

  it('rotates by size and keeps only the newest files', async () => {
    const log = logger({ maxBytes: 150, keep: 3 })

    for (let i = 0; i < 10; i++) log.info(`line ${i}`)
    await log.flush()

    expect(readdirSync(dir).sort()).toEqual([
      'trophy-locker.1.log',
      'trophy-locker.2.log',
      'trophy-locker.log',
    ])
    expect(lines().at(-1)?.message).toBe('line 9')
    expect(lines('trophy-locker.1.log').at(-1)?.message).toBe('line 7')
  })

  it('counts a file left by an earlier run toward the size limit', async () => {
    writeFileSync(join(dir, LOG_FILE), `${'x'.repeat(100)}\n`)
    const log = logger({ maxBytes: 120 })

    log.info('first of this run')
    await log.flush()

    expect(readFileSync(join(dir, 'trophy-locker.1.log'), 'utf8')).toContain('xxxx')
    expect(lines().map((entry) => entry.message)).toEqual(['first of this run'])
  })

  it('reports a problem once and never throws when it cannot write', async () => {
    writeFileSync(join(dir, 'blocked'), '')
    const onProblem = vi.fn()
    const log = logger({ dir: join(dir, 'blocked'), onProblem })

    log.info('one')
    log.info('two')
    await expect(log.flush()).resolves.toBeUndefined()

    expect(onProblem).toHaveBeenCalledOnce()
  })

  it('keeps working once a blocked folder is cleared', async () => {
    writeFileSync(join(dir, 'blocked'), '')
    const log = logger({ dir: join(dir, 'blocked'), onProblem: vi.fn() })

    log.info('lost')
    await log.flush()
    rmSync(join(dir, 'blocked'))
    log.info('kept')
    await log.flush()

    expect(lines(join('blocked', LOG_FILE)).map((entry) => entry.message)).toEqual(['kept'])
  })

  it('is available at first, unavailable after a blocked write, and available again after a good one', async () => {
    writeFileSync(join(dir, 'blocked'), '')
    const log = logger({ dir: join(dir, 'blocked'), onProblem: vi.fn() })
    expect(log.available).toBe(true)

    log.info('lost')
    await log.flush()
    expect(log.available).toBe(false)

    rmSync(join(dir, 'blocked'))
    log.info('kept')
    await log.flush()
    expect(log.available).toBe(true)
  })

  it('does not throw when the data has a throwing getter', async () => {
    const onProblem = vi.fn()
    const log = logger({ onProblem })

    expect(() =>
      log.info('m', {
        get a(): number {
          throw new Error('x')
        },
      }),
    ).not.toThrow()
    await log.flush()

    expect(onProblem).toHaveBeenCalledOnce()
  })

  it('does not throw when the clock throws', async () => {
    const onProblem = vi.fn()
    const log = logger({
      onProblem,
      now: () => {
        throw new Error('clock')
      },
    })

    expect(() => log.info('m')).not.toThrow()
    await log.flush()

    expect(onProblem).toHaveBeenCalledOnce()
  })

  it('survives an onProblem that throws', async () => {
    writeFileSync(join(dir, 'blocked'), '')
    const log = logger({
      dir: join(dir, 'blocked'),
      onProblem: () => {
        throw new Error('handler')
      },
    })

    log.info('lost')
    await expect(log.flush()).resolves.toBeUndefined()
    rmSync(join(dir, 'blocked'))
    log.info('kept')
    await expect(log.flush()).resolves.toBeUndefined()

    expect(lines(join('blocked', LOG_FILE)).map((entry) => entry.message)).toEqual(['kept'])
  })

  it('still rotates when keep is below one', async () => {
    const log = logger({ maxBytes: 100, keep: 0 })

    for (let i = 0; i < 10; i++) log.info(`line ${i}`)
    await log.flush()

    expect(readdirSync(dir)).toEqual([LOG_FILE])
    expect(lines().length).toBeLessThan(5)
  })
})
