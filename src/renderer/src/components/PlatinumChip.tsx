import { Crown } from 'lucide-react'

interface PlatinumChipProps {
  className?: string
}

export function PlatinumChip({ className = '' }: PlatinumChipProps) {
  return (
    <span
      data-platinum=""
      className={`inline-flex h-5 items-center gap-1.5 rounded-full border border-(--rarity)/40 bg-linear-to-r from-(--rarity)/24 to-(--rarity-dark)/14 pr-2 pl-1.5 text-[10.5px] font-bold whitespace-nowrap text-(--rarity) shadow-chip-platinum ${className}`}
    >
      <Crown aria-hidden="true" className="size-2.5" />
      Platinum
    </span>
  )
}
