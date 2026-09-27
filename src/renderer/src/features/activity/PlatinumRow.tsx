import { Crown } from 'lucide-react'
import { PlatformBadge } from '@/components/PlatformBadge'
import { PlatinumChip } from '@/components/PlatinumChip'
import type { RecentPlatinum } from '@shared/library'

interface PlatinumRowProps {
  platinum: RecentPlatinum
  when: string
  onOpenGame: (id: number, platformGameId?: number) => void
}

export function PlatinumRow({ platinum, when, onOpenGame }: PlatinumRowProps) {
  return (
    <li>
      <button
        type="button"
        data-platinum=""
        onClick={() => onOpenGame(platinum.gameId, platinum.platformGameId)}
        className="flex w-full items-center gap-4 rounded-[20px] bg-linear-to-r from-(--rarity)/10 to-transparent p-3 text-left transition-colors hover:bg-white/5"
      >
        <span className="flex size-13 shrink-0 items-center justify-center rounded-[15px] bg-linear-140 from-(--rarity-light) to-(--rarity-dark) text-(--rarity-on) shadow-tile">
          <Crown aria-hidden="true" className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">Platinum</span>
          <span className="truncate text-[13px] text-fg/80">
            Every achievement in {platinum.gameTitle}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-fg-muted">
            <PlatformBadge platform={platinum.platform} size={18} />
            <span className="truncate">{platinum.gameTitle}</span>
          </span>
        </span>
        <PlatinumChip />
        <span className="w-16" />
        <span className="w-24 text-right text-[13px] text-fg-muted">{when}</span>
      </button>
    </li>
  )
}
