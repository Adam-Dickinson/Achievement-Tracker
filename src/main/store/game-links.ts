import type { DatabaseSync } from 'node:sqlite'
import { matchKey } from './match-key'

interface PlatformGameLink {
  id: number
  game_id: number
  title: string
}

export function gameForTitle(db: DatabaseSync, title: string): number {
  const key = matchKey(title)
  if (key === '') return insertGame(db, title)
  return findAlias(db, key) ?? claim(db, key, insertGame(db, title))
}

export function relinkGames(db: DatabaseSync): number {
  const games = db
    .prepare(`SELECT id, game_id, title FROM platform_game WHERE linked = 'auto' ORDER BY id`)
    .all() as unknown as PlatformGameLink[]
  const move = db.prepare('UPDATE platform_game SET game_id = ? WHERE id = ?')

  return inTransaction(db, () => {
    let moved = 0
    for (const game of games) {
      const target = relinkTarget(db, game)
      if (target === game.game_id) continue
      move.run(target, game.id)
      moved++
    }
    deleteEmptyGames(db)
    return moved
  })
}

export function mergeGames(db: DatabaseSync, intoGameId: number, gameId: number): boolean {
  if (intoGameId === gameId || !gameExists(db, intoGameId) || !gameExists(db, gameId)) return false
  inTransaction(db, () => {
    db.prepare(
      `UPDATE platform_game SET game_id = ?, linked = 'manual' WHERE game_id IN (?, ?)`,
    ).run(intoGameId, intoGameId, gameId)
    db.prepare('UPDATE game_alias SET game_id = ? WHERE game_id = ?').run(intoGameId, gameId)
    db.prepare('DELETE FROM game WHERE id = ?').run(gameId)
  })
  return true
}

export function unlinkPlatformGame(db: DatabaseSync, platformGameId: number): boolean {
  const game = db
    .prepare('SELECT id, game_id, title FROM platform_game WHERE id = ?')
    .get(platformGameId) as PlatformGameLink | undefined
  if (!game || entryCount(db, game.game_id) < 2) return false
  inTransaction(db, () => {
    db.prepare(`UPDATE platform_game SET game_id = ?, linked = 'manual' WHERE id = ?`).run(
      insertGame(db, game.title),
      game.id,
    )
  })
  return true
}

function relinkTarget(db: DatabaseSync, game: PlatformGameLink): number {
  const key = matchKey(game.title)
  if (key === '') {
    return entryCount(db, game.game_id) > 1 ? insertGame(db, game.title) : game.game_id
  }
  const aliased = findAlias(db, key)
  if (aliased !== null) return aliased
  const current = hasAlias(db, game.game_id) ? insertGame(db, game.title) : game.game_id
  return claim(db, key, current)
}

function findAlias(db: DatabaseSync, key: string): number | null {
  const row = db.prepare('SELECT game_id FROM game_alias WHERE match_key = ?').get(key) as
    { game_id: number } | undefined
  return row?.game_id ?? null
}

function claim(db: DatabaseSync, key: string, gameId: number): number {
  db.prepare('INSERT INTO game_alias (match_key, game_id) VALUES (?, ?)').run(key, gameId)
  return gameId
}

function insertGame(db: DatabaseSync, title: string): number {
  return Number(
    db.prepare('INSERT INTO game (title, sort_title) VALUES (?, ?)').run(title, title.toLowerCase())
      .lastInsertRowid,
  )
}

function hasAlias(db: DatabaseSync, gameId: number): boolean {
  return db.prepare('SELECT 1 FROM game_alias WHERE game_id = ? LIMIT 1').get(gameId) !== undefined
}

function gameExists(db: DatabaseSync, gameId: number): boolean {
  return db.prepare('SELECT 1 FROM game WHERE id = ?').get(gameId) !== undefined
}

function entryCount(db: DatabaseSync, gameId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM platform_game WHERE game_id = ?')
    .get(gameId) as { count: number }
  return row.count
}

export function deleteEmptyGames(db: DatabaseSync): void {
  const empty = 'SELECT id FROM game WHERE id NOT IN (SELECT game_id FROM platform_game)'
  db.exec(`DELETE FROM game_alias WHERE game_id IN (${empty})`)
  db.exec(`DELETE FROM game WHERE id IN (${empty})`)
}

function inTransaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec('BEGIN')
  try {
    const result = run()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
