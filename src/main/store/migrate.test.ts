import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { applyMigrations, getSchemaVersion } from './migrate'
import { MIGRATIONS } from './migrations'

function tableNames(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String(row['name']))
}

describe('migrations', () => {
  it('are numbered sequentially from 1 and non-empty', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0)
    MIGRATIONS.forEach((migration, index) => {
      expect(migration.version).toBe(index + 1)
      expect(migration.name.startsWith(String(index + 1).padStart(4, '0') + '_')).toBe(true)
      expect(migration.sql.trim()).not.toBe('')
    })
  })

  it('create the schema when applied to an empty database', () => {
    const db = new DatabaseSync(':memory:')

    const version = applyMigrations(db)

    expect(version).toBe(MIGRATIONS.at(-1)?.version)
    for (const table of [
      'account',
      'game',
      'platform_game',
      'achievement',
      'unlock',
      'sync_state',
      'setting',
    ]) {
      expect(tableNames(db)).toContain(table)
    }
  })

  it('give platform_game a baseline_cutoff column', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)

    const columns = db
      .prepare('PRAGMA table_info(platform_game)')
      .all()
      .map((row) => String(row['name']))
    expect(columns).toContain('baseline_cutoff')
  })

  it('upgrade a version 1 database with data to the latest, keeping every row', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db, MIGRATIONS.slice(0, 1))
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (1, 'steam', 'acc1', 'Test', 'connected', '2026-01-01');
      INSERT INTO game (id, title, sort_title) VALUES (1, 'Portal', 'portal');
      INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title, baseline_done)
      VALUES (1, 1, 1, 'steam', '400', 'Portal', 1);
    `)

    applyMigrations(db)

    expect(getSchemaVersion(db)).toBe(MIGRATIONS.at(-1)?.version)
    expect(
      db
        .prepare('SELECT external_id, title, baseline_done, baseline_cutoff FROM platform_game')
        .all(),
    ).toEqual([{ external_id: '400', title: 'Portal', baseline_done: 1, baseline_cutoff: null }])
  })

  it('upgrade a version 2 database for game linking, moving each cover to its platform game', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db, MIGRATIONS.slice(0, 2))
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (1, 'steam', 'acc1', 'Test', 'connected', '2026-01-01');
      INSERT INTO game (id, title, sort_title, cover_url)
      VALUES (1, 'Portal', 'portal', 'https://cover/portal.jpg'), (2, 'Doom', 'doom', NULL);
      INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title)
      VALUES (1, 1, 1, 'steam', '400', 'Portal'), (2, 2, 1, 'steam', '500', 'Doom');
    `)

    applyMigrations(db)

    expect(db.prepare('SELECT id, cover_url, linked FROM platform_game ORDER BY id').all()).toEqual(
      [
        { id: 1, cover_url: 'https://cover/portal.jpg', linked: 'auto' },
        { id: 2, cover_url: null, linked: 'auto' },
      ],
    )
    expect(tableNames(db)).toContain('game_alias')
  })

  it('add an artwork table keyed by cleaned title, keeping existing games', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db, MIGRATIONS.slice(0, 3))
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (1, 'epic', 'acc1', 'Test', 'connected', '2026-01-01');
      INSERT INTO game (id, title, sort_title) VALUES (1, 'Death Stranding', 'death stranding');
      INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title)
      VALUES (1, 1, 1, 'epic', 'ns', 'Death Stranding');
    `)

    applyMigrations(db)
    db.prepare('INSERT INTO artwork (match_key, url, checked_at) VALUES (?, ?, ?)').run(
      'death stranding',
      null,
      '2026-09-26T00:00:00.000Z',
    )

    expect(tableNames(db)).toContain('artwork')
    expect(db.prepare('SELECT COUNT(*) AS count FROM platform_game').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT match_key, url FROM artwork').all()).toEqual([
      { match_key: 'death stranding', url: null },
    ])
  })

  it("clear Steam's old-style header links so the next sync stores working ones", () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db, MIGRATIONS.slice(0, 4))
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (1, 'steam', 's', 'Test', 'connected', '2026-01-01'),
             (2, 'epic', 'e', 'Test', 'connected', '2026-01-01');
      INSERT INTO game (id, title, sort_title) VALUES (1, 'A', 'a'), (2, 'B', 'b'), (3, 'C', 'c');
      INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title, cover_url)
      VALUES
        (1, 1, 1, 'steam', '400', 'A', 'https://cdn.akamai.steamstatic.com/steam/apps/400/header.jpg'),
        (2, 2, 1, 'steam', '500', 'B', 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/500/h/header.jpg'),
        (3, 3, 2, 'epic', 'x', 'C', 'https://cdn1.epicgames.com/x.jpg');
    `)

    applyMigrations(db)

    expect(db.prepare('SELECT id, cover_url FROM platform_game ORDER BY id').all()).toEqual([
      { id: 1, cover_url: null },
      {
        id: 2,
        cover_url:
          'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/500/h/header.jpg',
      },
      { id: 3, cover_url: 'https://cdn1.epicgames.com/x.jpg' },
    ])
  })

  it('add an empty platinum table, keeping existing games', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db, MIGRATIONS.slice(0, 5))
    db.exec(`
      INSERT INTO account (id, platform, external_id, display_name, status, created_at)
      VALUES (1, 'steam', 's', 'Test', 'connected', '2026-01-01');
      INSERT INTO game (id, title, sort_title) VALUES (1, 'A', 'a');
      INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title)
      VALUES (1, 1, 1, 'steam', '400', 'A');
    `)

    applyMigrations(db)

    expect(tableNames(db)).toContain('platinum')
    expect(db.prepare('SELECT COUNT(*) AS n FROM platinum').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM platform_game').get()).toEqual({ n: 1 })
    db.exec(`INSERT INTO platinum (platform_game_id, earned_at, detected_at) VALUES (1, NULL, 'x')`)
    expect(() =>
      db.exec(
        `INSERT INTO platinum (platform_game_id, earned_at, detected_at) VALUES (9, NULL, 'x')`,
      ),
    ).toThrow()
  })

  it('are a no-op when applied twice', () => {
    const db = new DatabaseSync(':memory:')
    const first = applyMigrations(db)

    expect(applyMigrations(db)).toBe(first)
    expect(getSchemaVersion(db)).toBe(first)
  })

  it('roll back a failing migration and keep the previous version', () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db, [{ version: 1, name: '0001_ok', sql: 'CREATE TABLE a (id INTEGER)' }])

    expect(() =>
      applyMigrations(db, [
        { version: 1, name: '0001_ok', sql: 'CREATE TABLE a (id INTEGER)' },
        { version: 2, name: '0002_bad', sql: 'CREATE TABLE b (id INTEGER); THIS IS NOT SQL' },
      ]),
    ).toThrow()

    expect(getSchemaVersion(db)).toBe(1)
    expect(tableNames(db)).not.toContain('b')
  })
})
