import { Activity, LayoutDashboard, Library, Plug, Settings, type LucideIcon } from 'lucide-react'

export type PageId = 'dashboard' | 'library' | 'activity' | 'accounts' | 'settings'

export interface NavItem {
  readonly id: PageId
  readonly label: string
  readonly description: string
  readonly icon: LucideIcon
  readonly ownHeading?: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Overall progress, platforms, closest to 100%, recent and rarest unlocks.',
    icon: LayoutDashboard,
    ownHeading: true,
  },
  {
    id: 'library',
    label: 'Library',
    description: 'Every game across every platform.',
    icon: Library,
    ownHeading: true,
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'A timeline of everything you have unlocked.',
    icon: Activity,
    ownHeading: true,
  },
  {
    id: 'accounts',
    label: 'Accounts',
    description: 'Connect the platforms you play on.',
    icon: Plug,
    ownHeading: true,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Notifications, sync, startup and appearance.',
    icon: Settings,
  },
]
