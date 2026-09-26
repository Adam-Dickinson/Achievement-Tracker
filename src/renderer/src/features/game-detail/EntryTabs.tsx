import { completionPercent } from '@shared/dashboard'
import type { GameEntry } from '@shared/library'
import { entryLabel } from './entry-label'

interface EntryTabsProps {
  entries: readonly GameEntry[]
  selected: number
  onSelect: (platformGameId: number) => void
}

export function EntryTabs({ entries, selected, onSelect }: EntryTabsProps) {
  return (
    <div role="tablist" aria-label="Platforms" className="flex flex-wrap gap-3">
      {entries.map((entry) => {
        const active = entry.platformGameId === selected
        const percent = completionPercent(entry.unlocked, entry.total)
        return (
          <button
            key={entry.platformGameId}
            type="button"
            role="tab"
            id={`entry-tab-${entry.platformGameId}`}
            aria-selected={active}
            aria-controls="entry-panel"
            onClick={() => onSelect(entry.platformGameId)}
            className={`flex min-w-44 flex-col gap-2 rounded-panel border px-4 py-3 text-left transition-colors ${
              active
                ? 'border-primary bg-surface-2'
                : 'border-line bg-surface-1 text-fg-muted hover:text-fg'
            }`}
          >
            <span className="text-sm font-semibold">{entryLabel(entry)}</span>
            <span className="text-xs">
              <b className="text-fg">{entry.unlocked}</b> / {entry.total}
            </span>
            <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-surface-3">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${percent}%` }}
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}
