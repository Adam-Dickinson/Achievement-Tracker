import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RemoteGame } from '@shared/models'
import type { Platform } from '@shared/platform'
import { gameForTitle, mergeGames, relinkGames, unlinkPlatformGame } from './game-links'
import { applyMigrations } from './migrate'
import { type AccountRow, addPlatformGames, upsertAccount } from './sync-store'

let db: DatabaseSync
let accounts: Record<'steam' | 'playstation' | 'ea' | 'epic', AccountRow>

function account(platform: Platform): AccountRow {
  return upsertAccount(db, { platform, externalId: `${platform}-1`, displayName: 'Test' })
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  applyMigrations(db)
  accounts = {
    steam: account('steam'),
    playstation: account('playstation'),
    ea: account('ea'),
    epic: account('epic'),
  }
})

function remote(externalId: string, title: string): RemoteGame {
  return {
    ref: { externalId },
    title,
    iconUrl: null,
    coverUrl: null,
    lastPlayed: null,
    recentlyPlayed: false,
  }
}

function add(platform: keyof typeof accounts, externalId: string, title: string): number {
  addPlatformGames(db, accounts[platform], [remote(externalId, title)])
  return idOf(externalId)
}

function idOf(externalId: string): number {
  const row = db.prepare('SELECT id FROM platform_game WHERE external_id = ?').get(externalId) as {
    id: number
  }
  return row.id
}

function gameOf(externalId: string): number {
  const row = db
    .prepare('SELECT game_id FROM platform_game WHERE external_id = ?')
    .get(externalId) as { game_id: number }
  return row.game_id
}

function linkedOf(externalId: string): string {
  const row = db
    .prepare('SELECT linked FROM platform_game WHERE external_id = ?')
    .get(externalId) as {
    linked: string
  }
  return row.linked
}

function gameCount(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM game').get() as { count: number }).count
}

function ungroupEverything(): void {
  db.exec('DELETE FROM game_alias')
  const rows = db.prepare('SELECT id, title FROM platform_game ORDER BY id').all() as {
    id: number
    title: string
  }[]
  for (const row of rows) {
    const gameId = Number(
      db.prepare('INSERT INTO game (title, sort_title) VALUES (?, ?)').run(row.title, row.title)
        .lastInsertRowid,
    )
    db.prepare('UPDATE platform_game SET game_id = ? WHERE id = ?').run(gameId, row.id)
  }
  db.exec('DELETE FROM game WHERE id NOT IN (SELECT game_id FROM platform_game)')
}

describe('gameForTitle', () => {
  it('gives titles that clean up the same one game, and others their own', () => {
    const apex = gameForTitle(db, 'Apex Legends')

    expect(gameForTitle(db, 'Apex Legends™')).toBe(apex)
    expect(gameForTitle(db, 'Destiny 2')).not.toBe(apex)
  })

  it('never shares a game for a title with nothing to match on', () => {
    expect(gameForTitle(db, '™')).not.toBe(gameForTitle(db, '™'))
  })
})

describe('adding games from syncs', () => {
  it('links the same game across platforms and PlayStation trophy lists', () => {
    add('steam', '2322010', 'God of War Ragnarök')
    add('playstation', 'trophy/NPWR26627_00', 'God of War Ragnarök (PS4)')
    add('playstation', 'trophy2/NPWR22392_00', 'God of War Ragnarök (PS5 / PC)')

    expect(
      new Set([gameOf('2322010'), gameOf('trophy/NPWR26627_00'), gameOf('trophy2/NPWR22392_00')])
        .size,
    ).toBe(1)
    expect(gameCount()).toBe(1)
    expect(linkedOf('2322010')).toBe('auto')
  })

  it('keeps a remaster apart from the original', () => {
    add('steam', '1', 'Sniper Elite V2')
    add('steam', '2', 'Sniper Elite V2 Remastered')

    expect(gameOf('1')).not.toBe(gameOf('2'))
  })
})

describe('relinkGames', () => {
  it('groups a library whose games each had a game of their own', () => {
    add('steam', '1', 'Apex Legends')
    add('ea', 'set-1', 'Apex Legends')
    add('playstation', 'trophy/NPWR1', 'Apex Legends™')
    add('steam', '2', 'Portal')
    ungroupEverything()
    expect(gameCount()).toBe(4)

    const moved = relinkGames(db)

    expect(moved).toBe(2)
    expect(gameCount()).toBe(2)
    expect(gameOf('set-1')).toBe(gameOf('1'))
    expect(gameOf('trophy/NPWR1')).toBe(gameOf('1'))
    expect(gameOf('2')).not.toBe(gameOf('1'))
  })

  it('keeps game ids when nothing needs to move, and does nothing the second time', () => {
    add('steam', '1', 'Apex Legends')
    add('ea', 'set-1', 'Apex Legends')
    const before = gameOf('1')

    expect(relinkGames(db)).toBe(0)
    expect(relinkGames(db)).toBe(0)
    expect(gameOf('1')).toBe(before)
  })

  it('never moves a game you merged or unlinked', () => {
    add('steam', '1', 'Apex Legends')
    add('ea', 'set-1', 'Apex Legends')
    unlinkPlatformGame(db, idOf('set-1'))

    relinkGames(db)

    expect(gameOf('set-1')).not.toBe(gameOf('1'))
  })

  it('moves a game whose title changed to its new group', () => {
    add('steam', '1', 'Destiny 2')
    add('epic', 'x', 'Codename Yorkie')
    db.prepare(`UPDATE platform_game SET title = 'Destiny 2' WHERE external_id = 'x'`).run()

    relinkGames(db)

    expect(gameOf('x')).toBe(gameOf('1'))
    expect(gameCount()).toBe(1)
  })
})

describe('mergeGames', () => {
  it('moves every entry into the game, marks them manual and removes the merged game', () => {
    add('steam', '1', 'Resident Evil 7 Biohazard')
    add('playstation', 'trophy/NPWR2', 'RE7')
    const into = gameOf('1')

    expect(mergeGames(db, into, gameOf('trophy/NPWR2'))).toBe(true)

    expect(gameOf('trophy/NPWR2')).toBe(into)
    expect([linkedOf('1'), linkedOf('trophy/NPWR2')]).toEqual(['manual', 'manual'])
    expect(gameCount()).toBe(1)
  })

  it('brings later entries with the merged title into the same game', () => {
    add('steam', '1', 'Resident Evil 7 Biohazard')
    add('playstation', 'trophy/NPWR2', 'RE7')
    mergeGames(db, gameOf('1'), gameOf('trophy/NPWR2'))

    add('ea', 'set-3', 'RE7')

    expect(gameOf('set-3')).toBe(gameOf('1'))
    expect(linkedOf('set-3')).toBe('auto')
  })

  it('refuses to merge a game into itself or with a game that does not exist', () => {
    add('steam', '1', 'Portal')

    expect(mergeGames(db, gameOf('1'), gameOf('1'))).toBe(false)
    expect(mergeGames(db, gameOf('1'), 999)).toBe(false)
    expect(mergeGames(db, 999, gameOf('1'))).toBe(false)
    expect(linkedOf('1')).toBe('auto')
  })
})

describe('unlinkPlatformGame', () => {
  it('moves one entry to a game of its own and leaves the rest linked', () => {
    add('steam', '1', 'Apex Legends')
    add('ea', 'set-1', 'Apex Legends')
    add('playstation', 'trophy/NPWR1', 'Apex Legends')
    const group = gameOf('1')

    expect(unlinkPlatformGame(db, idOf('set-1'))).toBe(true)

    expect(gameOf('set-1')).not.toBe(group)
    expect(gameOf('trophy/NPWR1')).toBe(group)
    expect(linkedOf('set-1')).toBe('manual')
    expect(linkedOf('1')).toBe('auto')
  })

  it('keeps later entries with the same title out of the unlinked game', () => {
    add('steam', '1', 'Apex Legends')
    add('ea', 'set-1', 'Apex Legends')
    unlinkPlatformGame(db, idOf('set-1'))

    add('playstation', 'trophy/NPWR1', 'Apex Legends')

    expect(gameOf('trophy/NPWR1')).toBe(gameOf('1'))
    expect(gameOf('trophy/NPWR1')).not.toBe(gameOf('set-1'))
  })

  it("refuses to unlink a game's only entry or an unknown entry", () => {
    add('steam', '1', 'Portal')

    expect(unlinkPlatformGame(db, idOf('1'))).toBe(false)
    expect(unlinkPlatformGame(db, 999)).toBe(false)
    expect(linkedOf('1')).toBe('auto')
  })
})
