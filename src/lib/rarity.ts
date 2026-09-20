export type Rarity = "common" | "uncommon" | "rare" | "ultra_rare";

/**
 * Tier from the global unlock percentage (0-100). Mirrors
 * `at_core::model::Rarity::from_percent`; keep the thresholds identical.
 */
export function rarityFromPercent(percent: number): Rarity {
  if (percent < 2) return "ultra_rare";
  if (percent < 10) return "rare";
  if (percent <= 30) return "uncommon";
  return "common";
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  ultra_rare: "Ultra Rare",
};
