import type { KnownGame } from '@shared/launch'
import type { InstalledGame, LaunchTarget } from './types'

export interface MatchedInstall {
  readonly known: KnownGame
  readonly target: LaunchTarget
}

const EDITION_WORDS =
  /\b(game of the year|goty|definitive|complete|deluxe|ultimate|standard|remastered|edition)\b/g

export function normalizeTitle(title: string): string {
  return title
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(EDITION_WORDS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchInstalled(
  known: readonly KnownGame[],
  installed: readonly InstalledGame[],
): MatchedInstall[] {
  const matches: MatchedInstall[] = []
  for (const game of known) {
    const samePlatform = installed.filter((item) => item.platform === game.platform)
    const wanted = normalizeTitle(game.title)
    const found =
      samePlatform.find((item) => item.externalId === game.externalId) ??
      (wanted === ''
        ? undefined
        : samePlatform.find((item) => normalizeTitle(item.title) === wanted))
    if (found) matches.push({ known: game, target: found.target })
  }
  return matches
}
