import { describe, expect, it } from 'vitest'
import { matchesSearch, searchText, searchWords } from './search'

describe('searchText', () => {
  it('ignores case and accents', () => {
    expect(searchText('Pokémon ÉCLAIR')).toBe('pokemon eclair')
  })
})

describe('searchWords', () => {
  it('splits a query into folded words, ignoring extra spaces', () => {
    expect(searchWords('  Black   Ops ')).toEqual(['black', 'ops'])
  })

  it('returns no words for an empty query', () => {
    expect(searchWords('   ')).toEqual([])
  })
})

describe('matchesSearch', () => {
  it('matches when every word appears somewhere, in any order', () => {
    expect(matchesSearch('Call of Duty®: Black Ops III', searchWords('ops black'))).toBe(true)
  })

  it('does not match when one word is missing', () => {
    expect(matchesSearch('Call of Duty®: Black Ops III', searchWords('black cod'))).toBe(false)
  })

  it('matches everything when there are no words', () => {
    expect(matchesSearch('Portal', [])).toBe(true)
  })

  it('matches part of a word, ignoring accents in the text', () => {
    expect(matchesSearch('Pokémon Legends', searchWords('poke'))).toBe(true)
  })
})
