import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { achievementId, MAX_TROPCONF_BYTES, parseTrophyList, parseUserName } from './parse'
import { DEMONS_SOULS, FIXTURE_DATA_DIR, USER_ID } from './test-helpers'

const REAL_LIST = readFileSync(
  join(FIXTURE_DATA_DIR, 'dev_hdd0', 'home', USER_ID, 'trophy', DEMONS_SOULS, 'TROPCONF.SFM'),
  'utf8',
)

function list(trophies: string, id = DEMONS_SOULS): string {
  return `<trophyconf><npcommid>${id}</npcommid><title-name>Test</title-name>${trophies}</trophyconf>`
}

function parseError(source: string): ProviderError {
  try {
    parseTrophyList(source)
  } catch (err) {
    if (err instanceof ProviderError) return err
    throw err
  }
  throw new Error('expected a ProviderError')
}

describe('parseTrophyList', () => {
  it('reads a real Demon’s Souls list, signature comment and all', () => {
    const parsed = parseTrophyList(REAL_LIST)

    expect(parsed.npCommId).toBe(DEMONS_SOULS)
    expect(parsed.title).toBe("Demon's Souls")
    expect(parsed.achievements).toHaveLength(38)
    expect(parsed.achievements[0]).toEqual({
      externalId: '000',
      name: 'Toughest Soul Trophy',
      description: 'All Trophies Obtained',
      iconUrl: null,
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: 'platinum',
      globalPercent: null,
    })
  })

  it('keeps curly quotes and ampersands from the descriptions', () => {
    const { achievements } = parseTrophyList(REAL_LIST)

    expect(achievements[1]?.description).toBe('Old One Put to Sleep & World United')
    expect(achievements[6]?.description).toBe('Slayer of Demon “False King”')
  })

  it('maps every grade and the hidden flag', () => {
    const parsed = parseTrophyList(
      list(
        `<trophy id="000" hidden="no" ttype="B"><name>a</name><detail>x</detail></trophy>
         <trophy id="001" hidden="yes" ttype="S"><name>b</name></trophy>`,
      ),
    )

    expect(parsed.achievements.map((a) => [a.tier, a.hidden, a.description])).toEqual([
      ['bronze', false, 'x'],
      ['silver', true, null],
    ])
  })

  it('names a trophy by its number when the list gives no name', () => {
    const parsed = parseTrophyList(list('<trophy id="004" hidden="no" ttype="B"></trophy>'))

    expect(parsed.achievements[0]?.name).toBe('Trophy 004')
  })

  it.each([
    ['a different root element', '<other/>'],
    ['no <npcommid>', '<trophyconf></trophyconf>'],
    ['a malformed <npcommid>', list('', '../etc')],
    ['a trophy with an unknown grade', list('<trophy id="000" hidden="no" ttype="X"/>')],
    ['a trophy with no id', list('<trophy hidden="no" ttype="B"/>')],
    [
      'a trophy listed twice',
      list('<trophy id="001" hidden="no" ttype="B"/><trophy id="1" hidden="no" ttype="B"/>'),
    ],
    ['markup that is not XML', '<trophyconf><trophy'],
    ['an empty file', ''],
  ])('refuses %s', (_label, source) => {
    expect(parseError(source).kind).toBe('parse')
  })

  it('refuses a list over the size limit', () => {
    expect(parseError('x'.repeat(MAX_TROPCONF_BYTES + 1)).kind).toBe('parse')
  })
})

describe('achievementId', () => {
  it('pads a trophy number to three digits, as the trophy list does', () => {
    expect([0, 7, 37, 120].map(achievementId)).toEqual(['000', '007', '037', '120'])
  })
})

describe('parseUserName', () => {
  it('trims the user name', () => {
    expect(parseUserName('User\n')).toBe('User')
  })

  it('has no name for an empty file', () => {
    expect(parseUserName('  \n')).toBeNull()
  })
})
