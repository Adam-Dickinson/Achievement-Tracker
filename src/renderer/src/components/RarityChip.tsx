import { RarityGem } from '@/components/RarityGem'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'

interface RarityChipProps {
  rarity: Rarity
  className?: string
}

// The chip's colours come from the --rarity variables that data-rarity sets (see index.css), so
// these classes are the same for every rarity. Full class names must appear literally so Tailwind
// can find them at build time.
const FILL = 'bg-(--rarity)/14'
// Ultra rare is the one chip with a gradient fill and a glow.
const ULTRA_FILL = 'bg-linear-to-r from-(--rarity)/24 to-(--rarity-dark)/14 shadow-chip-ultra'

/** A small pill with the rarity's gem and name. Rarity is always shown in words, not colour alone. */
export function RarityChip({ rarity, className = '' }: RarityChipProps) {
  const fill = rarity === 'ultra_rare' ? ULTRA_FILL : FILL

  return (
    <span
      data-rarity={rarity}
      className={`inline-flex h-5 items-center gap-1.5 rounded-full border border-(--rarity)/30 pr-2 pl-1.5 text-[10.5px] font-bold whitespace-nowrap text-(--rarity) ${fill} ${className}`}
    >
      <RarityGem rarity={rarity} className="size-2.5" />
      {RARITY_LABEL[rarity]}
    </span>
  )
}
