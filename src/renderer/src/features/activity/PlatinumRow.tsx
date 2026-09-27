import { Crown } from 'lucide-react'
import { PlatinumChip } from '@/components/PlatinumChip'
import type { RecentPlatinum } from '@shared/library'
import { platformName } from '@shared/platform'

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
        className="flex w-full items-center gap-4 bg-linear-to-r from-(--rarity)/10 to-transparent px-5 py-4 text-left transition-colors first:rounded-t-panel last:rounded-b-panel hover:bg-surface-2"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-card bg-linear-140 from-(--rarity-light) to-(--rarity-dark) text-(--rarity-on) shadow-tile">
          <Crown aria-hidden="true" className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">Platinum</span>
          <span className="truncate text-sm">Every achievement in {platinum.gameTitle}</span>
          <span className="truncate text-sm text-fg-muted">
            {platinum.gameTitle} · {platformName(platinum.platform)}
          </span>
        </span>
        <PlatinumChip />
        <span className="w-32 text-right text-xs text-fg-muted">{when}</span>
      </button>
    </li>
  )
}
