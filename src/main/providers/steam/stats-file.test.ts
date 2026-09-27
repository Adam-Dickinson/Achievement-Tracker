import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type { RemoteGameAchievements, RemoteUnlock } from '@shared/models'
import {
  localUnlocks,
  MAX_SCHEMA_FILE_BYTES,
  MAX_STATS_FILE_BYTES,
  parseKeyValues,
  readLocalUnlocks,
  type StatsFileReader,
  withLocalUnlocks,
} from './stats-file'
import { encode, type Tree } from './test/encode-key-values'

const APP = '1888930'
const at = (iso: string): number => Date.parse(iso) / 1000

function schemaFile(appId = APP): Buffer {
  return encode({
    [appId]: {
      stats: {
        '1': { type: 'INT', name: 'kills', default: 0 },
        '26': {
          type: 'ACHIEVEMENTS',
          bits: {
            '0': { name: 'ACH_FIRST', display: { name: { english: 'First' }, hidden: 0 } },
            '9': { name: 'ACH_NINTH', display: { name: { english: 'Ninth' }, hidden: 0 } },
            '23': { name: 'ACH_LATE', display: { name: { english: 'Late' }, hidden: 1 } },
          },
        },
        '27': {
          type: 'ACHIEVEMENTS',
          bits: { '31': { name: 'ACH_TOP_BIT', display: { name: { english: 'Top bit' } } } },
        },
      },
    },
  })
}

function statsFile(cache: Tree): Buffer {
  return encode({ cache: { crc: -833376575, PendingChanges: 0, ...cache } })
}

const unlocked = (id: string, iso: string | null): RemoteUnlock => ({
  achievementExternalId: id,
  unlockedAt: iso === null ? null : new Date(iso),
  progress: null,
})

async function parseError(run: () => unknown): Promise<ProviderError> {
  try {
    await run()
  } catch (error) {
    if (error instanceof ProviderError) return error
    throw error
  }
  throw new Error('expected a ProviderError')
}

describe('parseKeyValues', () => {
  it('reads sections, texts, whole numbers and decimals', () => {
    const bytes = encode({ a: { b: 'text', c: -7, d: { float: 1.5 } }, e: 2 })

    expect(parseKeyValues(bytes)).toEqual({ a: { b: 'text', c: -7, d: 1.5 }, e: 2 })
  })

  it('accepts the alternative end marker', () => {
    const bytes = Buffer.concat([Buffer.from('\x00s\x00\x01k\x00v\x00', 'latin1'), Buffer.of(11)])

    expect(parseKeyValues(bytes)).toEqual({ s: { k: 'v' } })
  })

  it.each([
    ['a number cut short', Buffer.from('\x02n\x00\x01\x02', 'latin1')],
    ['a text with no end', Buffer.from('\x01k\x00abc', 'latin1')],
    ['a section with no end', Buffer.from('\x00s\x00\x02n\x00\x01\x00\x00\x00', 'latin1')],
    ['an unknown value type', Buffer.from('\x07k\x00\x00\x00\x00\x00\x00\x00\x00\x00', 'latin1')],
    ['sections nested too deeply', Buffer.from('\x00s\x00'.repeat(40), 'latin1')],
  ])('rejects %s as a parse error', async (_label, bytes) => {
    expect((await parseError(() => parseKeyValues(bytes))).kind).toBe('parse')
  })
})

describe('localUnlocks', () => {
  it('lists each set achievement bit with its unlock time from the stats file', () => {
    const stats = statsFile({
      '1': { data: 4 },
      '26': {
        data: (1 << 9) | (1 << 23),
        AchievementTimes: { '9': at('2026-09-25T17:40:22Z'), '23': at('2026-09-26T10:28:09Z') },
      },
    })

    expect(localUnlocks(stats, schemaFile(), APP)).toEqual([
      unlocked('ACH_NINTH', '2026-09-25T17:40:22Z'),
      unlocked('ACH_LATE', '2026-09-26T10:28:09Z'),
    ])
  })

  it('reads bit 31, which makes the saved number negative', () => {
    const stats = statsFile({
      '27': { data: 1 << 31, AchievementTimes: { '31': at('2026-09-20T12:00:00Z') } },
    })

    expect(localUnlocks(stats, schemaFile(), APP)).toEqual([
      unlocked('ACH_TOP_BIT', '2026-09-20T12:00:00Z'),
    ])
  })

  it('gives no time for a set bit without one, and ignores times of bits that are not set', () => {
    const stats = statsFile({
      '26': { data: 1, AchievementTimes: { '9': at('2026-09-25T17:40:22Z') } },
    })

    expect(localUnlocks(stats, schemaFile(), APP)).toEqual([unlocked('ACH_FIRST', null)])
  })

  it('gives nothing for a game whose achievements were never saved', () => {
    expect(localUnlocks(statsFile({ '1': { data: 4 } }), schemaFile(), APP)).toEqual([])
  })

  it('skips a saved achievement stat of an unexpected shape', () => {
    const stats = statsFile({ '26': 'not a stat', '27': { data: 1 << 31 } })

    expect(localUnlocks(stats, schemaFile(), APP)).toEqual([unlocked('ACH_TOP_BIT', null)])
  })

  it('rejects a schema file for another game', async () => {
    const error = await parseError(() => localUnlocks(statsFile({}), schemaFile('440'), APP))

    expect(error.kind).toBe('parse')
  })

  it('rejects a stats file without its cache section', async () => {
    const error = await parseError(() => localUnlocks(encode({ other: 1 }), schemaFile(), APP))

    expect(error.kind).toBe('parse')
  })
})

describe('readLocalUnlocks', () => {
  const FOLDER = join('C:/Steam', 'appcache', 'stats')

  function reader(files: Record<string, Buffer>): StatsFileReader & {
    readFile: ReturnType<typeof vi.fn<StatsFileReader['readFile']>>
  } {
    return {
      readFile: vi.fn<StatsFileReader['readFile']>((path) => Promise.resolve(files[path] ?? null)),
    }
  }

  it("reads this account's stats file and the game's schema, each with its size limit", async () => {
    const files = reader({
      [join(FOLDER, `UserGameStats_39734273_${APP}.bin`)]: statsFile({ '26': { data: 1 } }),
      [join(FOLDER, `UserGameStatsSchema_${APP}.bin`)]: schemaFile(),
    })

    await expect(readLocalUnlocks(files, FOLDER, '39734273', APP)).resolves.toEqual([
      unlocked('ACH_FIRST', null),
    ])
    expect(files.readFile).toHaveBeenCalledWith(
      join(FOLDER, `UserGameStats_39734273_${APP}.bin`),
      MAX_STATS_FILE_BYTES,
    )
    expect(files.readFile).toHaveBeenCalledWith(
      join(FOLDER, `UserGameStatsSchema_${APP}.bin`),
      MAX_SCHEMA_FILE_BYTES,
    )
  })

  it('gives nothing when either file is missing', async () => {
    const files = reader({ [join(FOLDER, `UserGameStatsSchema_${APP}.bin`)]: schemaFile() })

    await expect(readLocalUnlocks(files, FOLDER, '39734273', APP)).resolves.toEqual([])
  })

  it('reads no file for an appid that is not a number', async () => {
    const files = reader({})

    await expect(readLocalUnlocks(files, FOLDER, '39734273', '../secrets')).resolves.toEqual([])
    expect(files.readFile).not.toHaveBeenCalled()
  })
})

describe('withLocalUnlocks', () => {
  const achievement = (externalId: string): RemoteGameAchievements['achievements'][number] => ({
    externalId,
    name: externalId,
    description: null,
    iconUrl: null,
    iconLockedUrl: null,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: null,
  })
  const remote: RemoteGameAchievements = {
    achievements: [achievement('A'), achievement('B'), achievement('C')],
    unlocks: [unlocked('A', '2026-09-20T10:00:01Z')],
  }

  it('adds unlocks Steam has saved locally but the Web API does not report yet', () => {
    const result = withLocalUnlocks(remote, [
      unlocked('A', '2026-09-20T10:00:00Z'),
      unlocked('B', '2026-09-26T10:28:09Z'),
    ])

    expect(result.unlocks).toEqual([
      unlocked('A', '2026-09-20T10:00:01Z'),
      unlocked('B', '2026-09-26T10:28:09Z'),
    ])
    expect(result.achievements).toBe(remote.achievements)
  })

  it('leaves out local unlocks of achievements the game schema does not list', () => {
    expect(withLocalUnlocks(remote, [unlocked('GONE', '2026-09-26T10:28:09Z')])).toBe(remote)
  })
})
