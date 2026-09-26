import { describe, expect, it } from 'vitest'
import { foldAccents } from './text'

describe('foldAccents', () => {
  it('drops accents and other combining marks, keeping the letters', () => {
    expect(foldAccents('God of War Ragnarök')).toBe('God of War Ragnarok')
    expect(foldAccents('Pokémon Café')).toBe('Pokemon Cafe')
  })

  it('leaves plain text alone', () => {
    expect(foldAccents('Portal 2')).toBe('Portal 2')
  })
})
