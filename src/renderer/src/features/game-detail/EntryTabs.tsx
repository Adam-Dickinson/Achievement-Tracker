import { PlatformBadge } from '@/components/PlatformBadge'
import type { GameEntry } from '@shared/library'
import { entryLabel } from './entry-label'

interface EntryTabsProps {
  entries: readonly GameEntry[]
  selected: number
  onSelect: (platformGameId: number) => void
}

export function EntryTabs({ entries, selected, onSelect }: EntryTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Platforms"
      className="flex flex-wrap gap-0.5 rounded-2xl border border-white/7 bg-white/6 p-1"
    >
      {entries.map((entry) => {
        const active = entry.platformGameId === selected
        return (
          <button
            key={entry.platformGameId}
            type="button"
            role="tab"
            id={`entry-tab-${entry.platformGameId}`}
            aria-selected={active}
            aria-controls="entry-panel"
            onClick={() => onSelect(entry.platformGameId)}
            className={`flex h-8.5 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              active
                ? 'bg-fg text-canvas shadow-[0_6px_16px_-6px_rgb(0_0_0/0.6)]'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <span aria-hidden="true" className="flex">
              <PlatformBadge platform={entry.platform} size={20} />
            </span>
            {entryLabel(entry)}{' '}
            <span className="tabular-nums opacity-60">
              {entry.unlocked}/{entry.total}
            </span>
          </button>
        )
      })}
    </div>
  )
}
