import type { KnownGame } from '@shared/launch'
import type { InstalledGame, LaunchTarget } from './types'

export interface MatchedInstall {
  readonly known: KnownGame
  readonly target: LaunchTarget
}

export interface InstallIndex {
  readonly byId: ReadonlyMap<string, InstalledGame>
  readonly byTitle: ReadonlyMap<string, readonly InstalledGame[]>
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

const idKey = (platform: string, externalId: string): string => `${platform}|${externalId}`

export function buildInstallIndex(installed: readonly InstalledGame[]): InstallIndex {
  const byId = new Map<string, InstalledGame>()
  const byTitle = new Map<string, InstalledGame[]>()
  for (const item of installed) {
    const id = idKey(item.platform, item.externalId)
    if (!byId.has(id)) byId.set(id, item)
    const title = normalizeTitle(item.title)
    if (title === '') continue
    const key = idKey(item.platform, title)
    const bucket = byTitle.get(key)
    if (bucket) bucket.push(item)
    else byTitle.set(key, [item])
  }
  return { byId, byTitle }
}

export function matchWithIndex(known: readonly KnownGame[], index: InstallIndex): MatchedInstall[] {
  const found: (InstalledGame | undefined)[] = known.map((game) =>
    index.byId.get(idKey(game.platform, game.externalId)),
  )
  const claimed = new Set<InstalledGame>()
  for (const item of found) if (item) claimed.add(item)

  known.forEach((game, position) => {
    if (found[position]) return
    const wanted = normalizeTitle(game.title)
    if (wanted === '') return
    const candidate = index.byTitle
      .get(idKey(game.platform, wanted))
      ?.find((item) => !claimed.has(item))
    if (!candidate) return
    claimed.add(candidate)
    found[position] = candidate
  })

  const matches: MatchedInstall[] = []
  known.forEach((game, position) => {
    const item = found[position]
    if (item) matches.push({ known: game, target: item.target })
  })
  return matches
}

export function matchInstalled(
  known: readonly KnownGame[],
  installed: readonly InstalledGame[],
): MatchedInstall[] {
  return matchWithIndex(known, buildInstallIndex(installed))
}
