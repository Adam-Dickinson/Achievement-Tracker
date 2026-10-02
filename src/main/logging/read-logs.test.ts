import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LogLevel } from '@shared/logs'
import { readLogs } from './read-logs'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'read-logs-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function entry(message: string, level: LogLevel = 'info'): string {
  return JSON.stringify({ time: '2026-10-02T12:00:00.000Z', level, message })
}

function file(name: string, ...rows: string[]): void {
  writeFileSync(join(dir, name), `${rows.join('\n')}\n`)
}

describe('readLogs', () => {
  it('returns nothing when there is no log yet', async () => {
    expect(await readLogs(dir, 'debug')).toEqual([])
  })

  it('joins the files, oldest entry first', async () => {
    file('trophy-locker.2.log', entry('a'))
    file('trophy-locker.1.log', entry('b'), entry('c'))
    file('trophy-locker.log', entry('d'))

    const messages = (await readLogs(dir, 'debug')).map((item) => item.message)

    expect(messages).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps only the newest entries when there are more than the limit', async () => {
    file('trophy-locker.1.log', entry('a'), entry('b'))
    file('trophy-locker.log', entry('c'), entry('d'))

    const messages = (await readLogs(dir, 'debug', 3)).map((item) => item.message)

    expect(messages).toEqual(['b', 'c', 'd'])
  })

  it('filters by level without counting what it skipped toward the limit', async () => {
    file('trophy-locker.log', entry('i1'), entry('w1', 'warn'), entry('i2'), entry('e1', 'error'))

    const messages = (await readLogs(dir, 'warn', 5)).map((item) => item.message)

    expect(messages).toEqual(['w1', 'e1'])
  })

  it('skips a half-written last line and lines that are not entries', async () => {
    writeFileSync(
      join(dir, 'trophy-locker.log'),
      `${entry('a')}\nnot json\n{"time":1}\n${entry('b')}\n{"time":"2026-10-02T12:00:00.000Z","lev`,
    )

    const messages = (await readLogs(dir, 'debug')).map((item) => item.message)

    expect(messages).toEqual(['a', 'b'])
  })

  it('reads only the logger’s own files', async () => {
    file('trophy-locker.log', entry('mine'))
    file('other.log', entry('not mine'))
    file('trophy-locker.9.log', entry('too old'))

    const messages = (await readLogs(dir, 'debug')).map((item) => item.message)

    expect(messages).toEqual(['mine'])
  })

  it('keeps the data of an entry', async () => {
    file(
      'trophy-locker.log',
      JSON.stringify({
        time: '2026-10-02T12:00:00.000Z',
        level: 'info',
        message: 'm',
        data: { a: 1 },
      }),
    )

    expect((await readLogs(dir, 'debug'))[0]).toMatchObject({ data: { a: 1 } })
  })
})
