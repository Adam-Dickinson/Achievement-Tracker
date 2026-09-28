import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import {
  MAX_TROPHY_FILE_BYTES,
  parseHomeDir,
  parseTrophyList,
  parseUserTrophies,
  parseUsers,
} from './parse'

const DATA = 'tests/fixtures/shadps4/data'
const BLOODBORNE = 'NPWR05818_00'

function fixture(path: string): string {
  return readFileSync(resolve(DATA, path), 'utf8')
}

function thrown(run: () => unknown): ProviderError {
  try {
    run()
  } catch (err) {
    if (err instanceof ProviderError) return err
    throw err
  }
  throw new Error('expected a ProviderError')
}

const CONF = (trophies: string) =>
  `<trophyconf><npcommid>${BLOODBORNE}</npcommid>${trophies}</trophyconf>`

describe('parseTrophyList', () => {
  const list = parseTrophyList(fixture(`trophy/${BLOODBORNE}/Xml/TROP.XML`))

  it('reads the trophy set id and game title', () => {
    expect(list.npCommId).toBe(BLOODBORNE)
    expect(list.title).toBe('Bloodborne')
  })

  it('reads every trophy with its name, description, tier and hidden flag', () => {
    expect(list.achievements).toHaveLength(40)
    expect(list.achievements[0]).toEqual({
      externalId: '000',
      name: 'Bloodborne',
      description: 'All trophies acquired. Hats off!',
      iconUrl: null,
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: 'platinum',
      globalPercent: null,
    })
    expect(list.achievements.find((trophy) => trophy.externalId === '001')).toMatchObject({
      hidden: true,
      tier: 'gold',
    })
  })

  it('turns the line breaks in descriptions into real ones', () => {
    expect(list.achievements.some((trophy) => trophy.description?.includes(',\nyou pledge'))).toBe(
      true,
    )
  })

  it('names trophies by number when only TROPCONF.XML is there', () => {
    const conf = parseTrophyList(fixture(`trophy/${BLOODBORNE}/Xml/TROPCONF.XML`))

    expect(conf.title).toBeNull()
    expect(conf.achievements[12]).toMatchObject({ name: 'Trophy 012', description: null })
  })

  it.each([
    ['a different root element', '<trophies/>'],
    ['no trophy set id', '<trophyconf><trophy id="000" hidden="no" ttype="P"/></trophyconf>'],
    ['a malformed trophy set id', '<trophyconf><npcommid>CUSA00900</npcommid></trophyconf>'],
    ['an unknown trophy type', CONF('<trophy id="000" hidden="no" ttype="X"/>')],
    ['a trophy without an id', CONF('<trophy hidden="no" ttype="B"/>')],
    [
      'a trophy listed twice',
      CONF('<trophy id="001" hidden="no" ttype="B"/><trophy id="001" hidden="no" ttype="B"/>'),
    ],
    ['broken XML', '<trophyconf><npcommid>'],
  ])('rejects %s as a parse error', (_case, source) => {
    expect(thrown(() => parseTrophyList(source)).kind).toBe('parse')
  })

  it('refuses a file over the size limit', () => {
    const huge = CONF(' '.repeat(MAX_TROPHY_FILE_BYTES))

    expect(thrown(() => parseTrophyList(huge)).message).toMatch(/too large/)
  })
})

describe('parseUserTrophies', () => {
  it("reads a user's unlocked trophies with their unlock times", () => {
    const user = parseUserTrophies(fixture(`home/1000/trophy/${BLOODBORNE}.xml`))

    expect(user.npCommId).toBe(BLOODBORNE)
    expect(user.unlocks.map((unlock) => unlock.achievementExternalId)).toEqual([
      '012',
      '014',
      '015',
      '021',
      '022',
      '023',
      '024',
      '029',
      '030',
      '031',
    ])
    expect(user.unlocks[0]).toEqual({
      achievementExternalId: '012',
      unlockedAt: new Date('2026-07-07T21:03:05.000Z'),
      progress: null,
    })
  })

  it('finds no unlocks for a user who has not played', () => {
    expect(parseUserTrophies(fixture(`home/1001/trophy/${BLOODBORNE}.xml`)).unlocks).toEqual([])
  })

  it('treats a trophy marked unlocked without a time as unlocked at an unknown time', () => {
    const user = parseUserTrophies(
      CONF('<trophy id="003" hidden="no" ttype="B" unlockstate="true" timestamp="0"/>'),
    )

    expect(user.unlocks).toEqual([
      { achievementExternalId: '003', unlockedAt: null, progress: null },
    ])
  })

  it('ignores trophies marked unlockstate="false"', () => {
    const user = parseUserTrophies(
      CONF('<trophy id="003" hidden="no" ttype="B" unlockstate="false" timestamp="5"/>'),
    )

    expect(user.unlocks).toEqual([])
  })

  it('rejects a timestamp that is not a number', () => {
    const source = CONF(
      '<trophy id="003" hidden="no" ttype="B" unlockstate="true" timestamp="soon"/>',
    )

    expect(thrown(() => parseUserTrophies(source)).kind).toBe('parse')
  })
})

describe('parseUsers', () => {
  it("reads shadPS4's users with their names", () => {
    expect(parseUsers(fixture('users.json'))).toEqual([
      { id: '1000', name: 'Player 1' },
      { id: '1001', name: 'Player 2' },
      { id: '1002', name: 'Player 3' },
      { id: '1003', name: 'Player 4' },
    ])
  })

  it('names a user with a blank name by their id', () => {
    const source = JSON.stringify({ Users: { user: [{ user_id: 1000, user_name: ' ' }] } })

    expect(parseUsers(source)).toEqual([{ id: '1000', name: 'User 1000' }])
  })

  it.each([
    ['not JSON', 'nope'],
    ['no user list', '{"Users":{}}'],
  ])('rejects a users.json with %s', (_case, source) => {
    expect(thrown(() => parseUsers(source)).kind).toBe('parse')
  })
})

describe('parseHomeDir', () => {
  it('reads the home folder shadPS4 was set to use', () => {
    expect(parseHomeDir(fixture('config.json'))).toBe(
      'C:/Users/player/AppData/Roaming/shadPS4/home',
    )
  })

  it('has no home folder when the config does not set one', () => {
    expect(parseHomeDir('{"General":{"home_dir":""}}')).toBeNull()
    expect(parseHomeDir('{}')).toBeNull()
  })

  it('rejects a config that is not JSON', () => {
    expect(thrown(() => parseHomeDir('[General]')).kind).toBe('parse')
  })
})
