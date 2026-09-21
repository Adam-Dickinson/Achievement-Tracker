import { Rarity } from '@shared/rarity'
import { Circle, Diamond, Hexagon, LucideIcon, Sparkle } from 'lucide-react'

interface RarityGemProps {
  rarity: Rarity
  className?: string
}

const GEMS: Record<Rarity, LucideIcon> = {
  common: Circle,
  uncommon: Diamond,
  rare: Hexagon,
  ultra_rare: Sparkle,
}

export function RarityGem({ rarity, className }: RarityGemProps) {
  const Shape = GEMS[rarity]
  return <Shape fill="currentColor" aria-hidden="true" className={className} />
}
