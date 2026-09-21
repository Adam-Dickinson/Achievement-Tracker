import { TrophyIcon } from '@/components/TrophyIcon'
import type { AppInfo } from '@shared/ipc'
import { NAV_ITEMS, type PageId } from './navigation'

interface IslandNavProps {
  selected: PageId
  onSelect: (page: PageId) => void
  info: AppInfo | null
}

export function IslandNav({ selected, onSelect, info }: IslandNavProps) {
  return (
    <header className="mx-8 mt-5 flex shrink-0 items-center gap-6 rounded-panel border border-line bg-surface-1 px-5 py-3 shadow-float">
      <div className="flex items-center gap-2.5">
        <TrophyIcon className="h-6 w-5 text-primary" />
        <span className="font-display text-base font-semibold">Achievement Tracker</span>
      </div>

      <nav aria-label="Main" className="flex flex-1 items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.id === selected
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
              className={`flex items-center gap-2 rounded-control px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active
                  ? 'bg-primary text-on-primary shadow-glow-primary'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              <Icon size={18} strokeWidth={1.75} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <span className="size-2 rounded-full bg-success" aria-hidden="true" />
        {info ? `v${info.version} · schema ${info.schemaVersion}` : 'Starting…'}
      </div>
    </header>
  )
}
