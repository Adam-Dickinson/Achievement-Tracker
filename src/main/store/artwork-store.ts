import type { DatabaseSync } from 'node:sqlite'
import { matchKey } from './match-key'

export interface ArtworkWanted {
  readonly matchKey: string
  readonly title: string
}

interface GameTitles {
  game_id: number
  titles: string
  covers: number
}

export function listArtworkWanted(db: DatabaseSync, checkedBefore: Date): ArtworkWanted[] {
  const games = db
    .prepare(
      `SELECT game_id, GROUP_CONCAT(title, char(31)) AS titles, COUNT(cover_url) AS covers
       FROM platform_game GROUP BY game_id HAVING covers = 0`,
    )
    .all() as unknown as GameTitles[]
  const known = new Set(
    (
      db
        .prepare('SELECT match_key FROM artwork WHERE url IS NOT NULL OR checked_at >= ?')
        .all(checkedBefore.toISOString()) as unknown as { match_key: string }[]
    ).map((row) => row.match_key),
  )

  const wanted = new Map<string, ArtworkWanted>()
  for (const game of games) {
    const title = shortest(game.titles.split('\u001f'))
    const key = matchKey(title)
    if (key !== '' && !known.has(key) && !wanted.has(key)) wanted.set(key, { matchKey: key, title })
  }
  return [...wanted.values()]
}

export function saveArtwork(db: DatabaseSync, key: string, url: string | null, now: Date): void {
  db.prepare(
    `INSERT INTO artwork (match_key, url, checked_at) VALUES (?, ?, ?)
     ON CONFLICT (match_key) DO UPDATE SET url = excluded.url, checked_at = excluded.checked_at`,
  ).run(key, url, now.toISOString())
}

export function listArtworkUrls(db: DatabaseSync): Map<string, string> {
  const rows = db
    .prepare('SELECT match_key, url FROM artwork WHERE url IS NOT NULL')
    .all() as unknown as { match_key: string; url: string }[]
  return new Map(rows.map((row) => [row.match_key, row.url]))
}

function shortest(titles: readonly string[]): string {
  return titles
    .map((title) => title.trim())
    .reduce((best, title) => (title.length < best.length ? title : best))
}
