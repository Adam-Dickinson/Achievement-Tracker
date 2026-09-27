export const RARITIES = ['common', 'uncommon', 'rare', 'ultra_rare'] as const
export type Rarity = (typeof RARITIES)[number]

export function rarityAtLeast(rarity: Rarity, minimum: Rarity): boolean {
  return RARITIES.indexOf(rarity) >= RARITIES.indexOf(minimum)
}

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
