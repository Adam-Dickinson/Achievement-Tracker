import { Activity, LayoutDashboard, Library, Plug, Settings, type LucideIcon } from 'lucide-react'

export type PageId = 'dashboard' | 'library' | 'activity' | 'accounts' | 'settings'

export interface NavItem {
  readonly id: PageId
  readonly label: string
  readonly description: string
  readonly icon: LucideIcon
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Overall progress, recent unlocks, closest to 100%.',
    icon: LayoutDashboard,
  },
  {
    id: 'library',
    label: 'Library',
    description: 'Every game across every platform.',
    icon: Library,
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'A timeline of everything you have unlocked.',
    icon: Activity,
  },
  {
    id: 'accounts',
    label: 'Accounts',
    description: 'Connect Steam, Xbox, PlayStation and emulators.',
    icon: Plug,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Notifications, sync, startup and appearance.',
    icon: Settings,
  },
]
