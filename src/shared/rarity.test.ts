import { describe, expect, it } from 'vitest'
import { rarityAtLeast, rarityFromPercent } from './rarity'

describe('rarityFromPercent', () => {
  it.each([
    [1.4, 'ultra_rare'],
    [2, 'rare'],
    [9.99, 'rare'],
    [10, 'uncommon'],
    [30, 'uncommon'],
    [42, 'common'],
  ] as const)('%s%% is %s', (percent, expected) => {
    expect(rarityFromPercent(percent)).toBe(expected)
  })
})

describe('rarityAtLeast', () => {
  it.each([
    ['common', 'common', true],
    ['uncommon', 'common', true],
    ['common', 'uncommon', false],
    ['ultra_rare', 'rare', true],
    ['rare', 'ultra_rare', false],
  ] as const)('%s at least %s is %s', (rarity, minimum, expected) => {
    expect(rarityAtLeast(rarity, minimum)).toBe(expected)
  })
})
