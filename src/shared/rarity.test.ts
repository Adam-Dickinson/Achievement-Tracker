import { describe, expect, it } from 'vitest'
import { rarityFromPercent } from './rarity'

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
