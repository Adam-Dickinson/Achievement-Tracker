import { TrophyIcon } from '@/components/TrophyIcon'
import type { AppInfo } from '@shared/ipc'
import { NAV_ITEMS, type PageId } from './navigation'

interface SidebarProps {
  selected: PageId
  onSelect: (page: PageId) => void
  info: AppInfo | null
}

export function Sidebar({ selected, onSelect, info }: SidebarProps) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface-1 p-4">
      <div className="mb-6 flex items-center gap-2.5 px-1 pt-1">
        <TrophyIcon className="h-6 w-5 text-primary" />
        <span className="font-display text-base font-semibold">Achievement Tracker</span>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.id === selected
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
              className={`flex items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              <Icon size={18} strokeWidth={1.75} className={active ? 'text-primary' : ''} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="flex items-center gap-2 px-1 text-xs text-fg-muted">
        <span className="size-2 rounded-full bg-success" aria-hidden="true" />
        {info ? `v${info.version} · schema ${info.schemaVersion}` : 'Starting…'}
      </div>
    </aside>
  )
}
