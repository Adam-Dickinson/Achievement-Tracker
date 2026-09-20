/** Rarity tier derived from the global unlock percentage (docs/DESIGN.md §6). */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'ultra_rare'

/** Maps the share of players (0-100) who unlocked an achievement to a tier. */
export function rarityFromPercent(percent: number): Rarity {
  if (percent < 2) return 'ultra_rare'
  if (percent < 10) return 'rare'
  if (percent <= 30) return 'uncommon'
  return 'common'
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  ultra_rare: 'Ultra Rare',
}
