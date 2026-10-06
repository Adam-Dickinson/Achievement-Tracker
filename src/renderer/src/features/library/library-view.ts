import { matchesSearch, searchWords } from '@/lib/search'
import type { LibraryGame } from '@shared/library'
import { PLATFORMS, type Platform } from '@shared/platform'

export type SortId = 'recent' | 'completion' | 'playtime' | 'title' | 'platform'
export type StatusId = 'all' | 'in_progress' | 'not_started' | 'completed'
export type PlatformFilter = Platform | 'all'
export type LayoutId = 'landscape' | 'portrait' | 'list'

export interface LibraryView {
  readonly query: string
  readonly platform: PlatformFilter
  readonly status: StatusId
  readonly sort: SortId
  readonly layout: LayoutId
  readonly installed: boolean
}

export const DEFAULT_VIEW: LibraryView = {
  query: '',
  platform: 'all',
  status: 'all',
  sort: 'recent',
  layout: 'landscape',
  installed: false,
}

export const SORTS: Record<
  SortId,
  { label: string; compare: (a: LibraryGame, b: LibraryGame) => number }
> = {
  recent: { label: 'Last unlock', compare: () => 0 },
  completion: { label: 'Completion', compare: (a, b) => ratio(b) - ratio(a) },
  playtime: {
    label: 'Playtime',
    compare: (a, b) => (b.playtimeSeconds ?? -1) - (a.playtimeSeconds ?? -1) || byTitle(a, b),
  },
  title: { label: 'Name', compare: byTitle },
  platform: {
    label: 'Platform',
    compare: (a, b) => platformOrder(a) - platformOrder(b) || byTitle(a, b),
  },
}

export const STATUSES: Record<StatusId, { label: string; keep: (game: LibraryGame) => boolean }> = {
  all: { label: 'All', keep: () => true },
  in_progress: {
    label: 'In progress',
    keep: (game) => game.unlocked > 0 && game.unlocked < game.total,
  },
  not_started: { label: 'Not started', keep: (game) => game.unlocked === 0 },
  completed: {
    label: 'Completed',
    keep: (game) => game.total > 0 && game.unlocked === game.total,
  },
}

export function clearFilters(view: LibraryView): LibraryView {
  return { ...DEFAULT_VIEW, sort: view.sort, layout: view.layout }
}

export function averageCompletion(games: readonly LibraryGame[]): number {
  const synced = games.filter((game) => game.total > 0)
  if (synced.length === 0) return 0
  const sum = synced.reduce((total, game) => total + game.unlocked / game.total, 0)
  return Math.floor((sum / synced.length) * 100)
}

export function applyView(
  games: readonly LibraryGame[],
  view: LibraryView,
  installedGameIds: ReadonlySet<number> = new Set(),
): LibraryGame[] {
  const words = searchWords(view.query)
  return games
    .filter((game) => matches(game, view, words, installedGameIds))
    .sort(SORTS[view.sort].compare)
}

export function countMatching(
  games: readonly LibraryGame[],
  view: LibraryView,
  installedGameIds: ReadonlySet<number> = new Set(),
): number {
  const words = searchWords(view.query)
  return games.filter((game) => matches(game, view, words, installedGameIds)).length
}

export function platformsIn(games: readonly LibraryGame[]): Platform[] {
  const present = new Set(games.flatMap((game) => game.platforms))
  return PLATFORMS.filter((platform) => present.has(platform))
}

export function isFiltered(view: LibraryView): boolean {
  return (
    view.query.trim() !== '' || view.platform !== 'all' || view.status !== 'all' || view.installed
  )
}

function matches(
  game: LibraryGame,
  view: LibraryView,
  words: readonly string[],
  installedGameIds: ReadonlySet<number>,
): boolean {
  return (
    (view.platform === 'all' || game.platforms.includes(view.platform)) &&
    STATUSES[view.status].keep(game) &&
    (!view.installed || installedGameIds.has(game.id)) &&
    matchesSearch(game.title, words)
  )
}

function ratio(game: LibraryGame): number {
  return game.total === 0 ? -1 : game.unlocked / game.total
}

function byTitle(a: LibraryGame, b: LibraryGame): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

function platformOrder(game: LibraryGame): number {
  const [best] = game.platforms
  return best ? PLATFORMS.indexOf(best) : PLATFORMS.length
}
