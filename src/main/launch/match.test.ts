import { describe, expect, it } from 'vitest'
import type { KnownGame } from '@shared/launch'
import { matchInstalled, normalizeTitle } from './match'
import type { InstalledGame } from './types'

const known = (over: Partial<KnownGame>): KnownGame => ({
  id: 1,
  gameId: 10,
  platform: 'steam',
  externalId: '220',
  title: 'Half-Life 2',
  ...over,
})

const installed = (over: Partial<InstalledGame>): InstalledGame => ({
  platform: 'steam',
  externalId: '220',
  title: 'Half-Life 2',
  target: { kind: 'uri', uri: 'steam://rungameid/220' },
  ...over,
})

describe('normalizeTitle', () => {
  it.each([
    ['The Witcher® 3: Wild Hunt', 'the witcher 3 wild hunt'],
    ['DOOM Eternal™', 'doom eternal'],
    ['Cyberpunk 2077 - Ultimate Edition', 'cyberpunk 2077'],
    ['Pokémon  Legends', 'pokemon legends'],
    ['  ', ''],
  ])('turns %j into %j', (title, expected) => {
    expect(normalizeTitle(title)).toBe(expected)
  })
})

describe('matchInstalled', () => {
  it('matches on platform and external id', () => {
    const result = matchInstalled([known({})], [installed({ title: 'Something else' })])

    expect(result).toHaveLength(1)
    expect(result[0]?.known.id).toBe(1)
  })

  it('falls back to the normalised title on the same platform', () => {
    const result = matchInstalled(
      [known({ externalId: 'abc', title: 'Doom Eternal' })],
      [installed({ externalId: 'zzz', title: 'DOOM Eternal™' })],
    )

    expect(result).toHaveLength(1)
  })

  it('never matches across platforms', () => {
    const result = matchInstalled([known({ platform: 'xbox' })], [installed({})])

    expect(result).toEqual([])
  })

  it('does not match two different games with an empty normalised title', () => {
    const result = matchInstalled(
      [known({ externalId: 'a', title: '™' })],
      [installed({ externalId: 'b', title: '®' })],
    )

    expect(result).toEqual([])
  })

  it('prefers the id match over a title match', () => {
    const byId = installed({
      externalId: '220',
      title: 'Different',
      target: { kind: 'uri', uri: 'steam://rungameid/220' },
    })
    const byTitle = installed({
      externalId: '999',
      title: 'Half-Life 2',
      target: { kind: 'uri', uri: 'steam://rungameid/999' },
    })

    const result = matchInstalled([known({})], [byTitle, byId])

    expect(result[0]?.target).toEqual({ kind: 'uri', uri: 'steam://rungameid/220' })
  })

  it('matches each known game separately', () => {
    const result = matchInstalled(
      [
        known({}),
        known({ id: 2, gameId: 11, platform: 'epic', externalId: 'e1', title: 'Fortnite' }),
      ],
      [installed({}), installed({ platform: 'epic', externalId: 'e1', title: 'Fortnite' })],
    )

    expect(result.map((match) => match.known.id)).toEqual([1, 2])
  })
})
