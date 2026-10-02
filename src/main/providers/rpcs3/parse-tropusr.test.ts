import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { MAX_TROPUSR_BYTES, parseTropUsr } from './parse-tropusr'
import { fixtureBytes, withUnlock } from './test-helpers'

const WHEN = new Date('2026-10-02T17:21:30.000Z')

function parseError(bytes: Uint8Array): ProviderError {
  try {
    parseTropUsr(bytes)
  } catch (err) {
    if (err instanceof ProviderError) return err
    throw err
  }
  throw new Error('expected a ProviderError')
}

describe('parseTropUsr', () => {
  it('reads a real Demon’s Souls file with nothing earned yet', () => {
    expect(parseTropUsr(fixtureBytes())).toEqual({ trophyCount: 38, unlocks: [] })
  })

  it('reads each earned trophy with the time it was earned', () => {
    const bytes = withUnlock(withUnlock(fixtureBytes(), 5, WHEN), 12, null)

    expect(parseTropUsr(bytes)).toEqual({
      trophyCount: 38,
      unlocks: [
        { trophyId: 5, unlockedAt: WHEN },
        { trophyId: 12, unlockedAt: null },
      ],
    })
  })

  it('treats a time outside the plausible range as unknown', () => {
    const bytes = withUnlock(fixtureBytes(), 3, new Date('1999-01-01T00:00:00.000Z'))

    expect(parseTropUsr(bytes).unlocks).toEqual([{ trophyId: 3, unlockedAt: null }])
  })

  it('refuses a file that is not a trophy progress file', () => {
    const bytes = fixtureBytes()
    bytes[0] = 0

    expect(parseError(bytes).kind).toBe('parse')
  })

  it.each([0, 10, 0x2f, 0x40, 0xeb0, 0xeb0 + 0x70 * 37 + 0x20, 8000])(
    'refuses the file cut short at %i bytes',
    (length) => {
      expect(parseError(fixtureBytes().subarray(0, length)).kind).toBe('parse')
    },
  )

  it('refuses a table count that cannot fit', () => {
    const bytes = fixtureBytes()
    bytes.writeUInt32BE(0xffffffff, 8)

    expect(parseError(bytes).kind).toBe('parse')
  })

  it('refuses a state table with a huge entry count', () => {
    const bytes = fixtureBytes()
    bytes.writeUInt32BE(0xffffffff, 0x50 + 12)

    expect(parseError(bytes).kind).toBe('parse')
  })

  it('refuses a state table that points past the end of the file', () => {
    const bytes = fixtureBytes()
    bytes.writeUInt32BE(0xfffffff0, 0x50 + 20)

    expect(parseError(bytes).kind).toBe('parse')
  })

  it('refuses entries too small to hold a state', () => {
    const bytes = fixtureBytes()
    bytes.writeUInt32BE(4, 0x50 + 4)

    expect(parseError(bytes).kind).toBe('parse')
  })

  it('refuses a file with no state table', () => {
    const bytes = fixtureBytes()
    bytes.writeUInt32BE(5, 0x50)

    expect(parseError(bytes).kind).toBe('parse')
  })

  it('refuses a trophy listed twice', () => {
    const bytes = fixtureBytes()
    bytes.writeUInt32BE(7, 0xeb0 + 0x70 * 8 + 0x10)

    expect(parseError(bytes).kind).toBe('parse')
  })

  it('refuses a file over the size limit before reading it', () => {
    expect(parseError(new Uint8Array(MAX_TROPUSR_BYTES + 1)).kind).toBe('parse')
  })
})
