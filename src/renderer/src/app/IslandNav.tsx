import { User } from 'lucide-react'
import logo from '@/assets/logo.svg'
import type { AppInfo } from '@shared/ipc'
import { NAV_ITEMS, type PageId } from './navigation'
import { NavSearch } from './NavSearch'
import { NotificationsToggle } from './NotificationsToggle'
import { SyncStatus } from './SyncStatus'

interface IslandNavProps {
  selected: PageId
  onSelect: (page: PageId) => void
  info: AppInfo | null
  query: string
  onSearch: (query: string) => void
}

export function IslandNav({ selected, onSelect, info, query, onSearch }: IslandNavProps) {
  return (
    <header className="sticky top-4 z-30 mx-auto mt-4 w-[calc(100%-48px)] max-w-348">
      <div className="flex h-15 items-center gap-2 rounded-island border border-white/9 bg-surface-1/72 pr-2.5 pl-3 shadow-island backdrop-blur-[22px] backdrop-saturate-150">
        <div className="flex shrink-0 items-center gap-2.5 pr-4">
          <img src={logo} alt="" className="size-9" />
          <span className="hidden font-display text-[17px] font-bold whitespace-nowrap min-[1320px]:inline">
            Trophy Locker
          </span>
        </div>

        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.id === selected
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                title={item.label}
                onClick={() => onSelect(item.id)}
                className={`flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary xl:px-4 ${
                  active
                    ? 'bg-primary text-on-primary shadow-glow-primary'
                    : 'text-fg-muted hover:bg-white/6 hover:text-fg'
                }`}
              >
                <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
                <span className="max-xl:sr-only">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <NavSearch value={query} onChange={onSearch} />
          <SyncStatus onOpenAccounts={() => onSelect('accounts')} />
          <NotificationsToggle />
          <Avatar name={info?.userName ?? ''} />
        </div>
      </div>
    </header>
  )
}

function Avatar({ name }: { name: string }) {
  const initial = Array.from(name)[0]?.toUpperCase()

  return (
    <span
      role={initial ? 'img' : undefined}
      aria-label={initial ? name : undefined}
      aria-hidden={initial ? undefined : true}
      title={name || undefined}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-135 from-primary to-aurora-teal font-display text-[15px] font-extrabold text-on-primary"
    >
      {initial ?? <User size={17} strokeWidth={2} aria-hidden="true" />}
    </span>
  )
}
