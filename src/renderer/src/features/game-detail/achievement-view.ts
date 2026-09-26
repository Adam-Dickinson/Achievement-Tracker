import { matchesSearch, searchWords } from '@/lib/search'
import type { GameAchievement } from '@shared/library'

export type FilterId = 'all' | 'unlocked' | 'locked'
export type AchievementSortId = 'rarity' | 'recent' | 'name'

export interface AchievementView {
  readonly filter: FilterId
  readonly sort: AchievementSortId
  readonly query: string
}

export const DEFAULT_ACHIEVEMENT_VIEW: AchievementView = {
  filter: 'all',
  sort: 'rarity',
  query: '',
}

export const FILTERS: Record<FilterId, { label: string; keep: (a: GameAchievement) => boolean }> = {
  all: { label: 'All', keep: () => true },
  unlocked: { label: 'Unlocked', keep: (a) => a.unlocked },
  locked: { label: 'Locked', keep: (a) => !a.unlocked },
}

export const ACHIEVEMENT_SORTS: Record<
  AchievementSortId,
  { label: string; compare: (a: GameAchievement, b: GameAchievement) => number }
> = {
  rarity: { label: 'Rarest', compare: byRarity },
  recent: {
    label: 'Latest unlocked',
    compare: (a, b) => unlockRank(b) - unlockRank(a) || byRarity(a, b),
  },
  name: { label: 'Name', compare: (a, b) => shownName(a).localeCompare(shownName(b)) },
}

export function isSecret(achievement: GameAchievement): boolean {
  return achievement.hidden && !achievement.unlocked
}

export function applyAchievementView(
  achievements: readonly GameAchievement[],
  view: AchievementView,
): GameAchievement[] {
  const words = searchWords(view.query)
  return achievements
    .filter((a) => FILTERS[view.filter].keep(a) && matchesWords(a, words))
    .sort(ACHIEVEMENT_SORTS[view.sort].compare)
}

export function countAchievements(
  achievements: readonly GameAchievement[],
  view: AchievementView,
): number {
  const words = searchWords(view.query)
  return achievements.filter((a) => FILTERS[view.filter].keep(a) && matchesWords(a, words)).length
}

export function byRarity(a: GameAchievement, b: GameAchievement): number {
  return (a.globalPercent ?? 101) - (b.globalPercent ?? 101) || a.name.localeCompare(b.name)
}

function matchesWords(achievement: GameAchievement, words: readonly string[]): boolean {
  if (words.length === 0) return true
  if (isSecret(achievement)) return false
  return matchesSearch(`${achievement.name} ${achievement.description ?? ''}`, words)
}

function unlockRank(achievement: GameAchievement): number {
  if (!achievement.unlocked) return -1
  return achievement.unlockedAt?.getTime() ?? 0
}

function shownName(achievement: GameAchievement): string {
  return isSecret(achievement) ? 'Hidden achievement' : achievement.name
}
