import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RemoteAchievement, RemoteGame } from '@shared/models'
import { buildDataExport, type ExportMeta } from './export-store'
import { applyMigrations } from './migrate'
import { awardPlatinums } from './platinum'
import {
  addPlatformGames,
  getPlatformGameByExternalId,
  insertNewUnlocks,
  upsertAccount,
  upsertAchievements,
} from './sync-store'

const NOW = new Date('2026-10-02T12:00:00.000Z')
const META: ExportMeta = { appVersion: '0.1.0', schemaVersion: 8, exportedAt: NOW }
const ACCOUNT_EXTERNAL_ID = 'steamid-7656119800000000'
const GAME_EXTERNAL_ID = 'appid-424242'

let db: DatabaseSync

function game(externalId: string, title: string): RemoteGame {
  return {
    ref: { externalId },
    title,
    iconUrl: 'https://icon/portal.jpg',
    coverUrl: 'https://cover/portal.jpg',
    lastPlayed: new Date('2026-09-30T10:00:00.000Z'),
    recentlyPlayed: true,
  }
}

function achievement(externalId: string, overrides: Partial<RemoteAchievement> = {}) {
  return {
    externalId,
    name: 'Achievement',
    description: 'Do the thing',
    iconUrl: null,
    iconLockedUrl: null,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: 12.5,
    ...overrides,
  } satisfies RemoteAchievement
}

function seed(): { accountId: number; platformGameId: number } {
  const account = upsertAccount(db, {
    platform: 'steam',
    externalId: ACCOUNT_EXTERNAL_ID,
    displayName: 'Player',
  })
  addPlatformGames(db, account, [game(GAME_EXTERNAL_ID, 'Portal')])
  const { id } = getPlatformGameByExternalId(db, account.id, GAME_EXTERNAL_ID)
  upsertAchievements(db, id, [
    achievement(`${GAME_EXTERNAL_ID}-0`, { tier: 'gold', points: 50 }),
    achievement(`${GAME_EXTERNAL_ID}-1`, { hidden: true }),
  ])
  insertNewUnlocks(db, id, [
    {
      achievementExternalId: `${GAME_EXTERNAL_ID}-0`,
      unlockedAt: new Date('2026-09-29T08:00:00.000Z'),
      progress: { current: 3, max: 5 },
    },
  ])
  return { accountId: account.id, platformGameId: id }
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  applyMigrations(db)
})

describe('buildDataExport', () => {
  it('exports an empty database as empty lists', () => {
    expect(buildDataExport(db, META)).toEqual({
      format: 1,
      exportedAt: '2026-10-02T12:00:00.000Z',
      app: { version: '0.1.0', schemaVersion: 8 },
      accounts: [],
      games: [],
      aliases: [],
      settings: {},
    })
  })

  it('exports an account without its platform id', () => {
    seed()

    const [account] = buildDataExport(db, META).accounts

    expect(account).toMatchObject({ platform: 'steam', displayName: 'Player', status: 'connected' })
    expect(account).not.toHaveProperty('externalId')
  })

  it('exports a game with its platform entry, achievements and unlocks', () => {
    const { accountId } = seed()

    const [exported] = buildDataExport(db, META).games
    const [entry] = exported?.entries ?? []

    expect(exported).toMatchObject({ title: 'Portal', releaseYear: null })
    expect(entry).toMatchObject({
      accountId,
      platform: 'steam',
      title: 'Portal',
      lastPlayed: '2026-09-30T10:00:00.000Z',
      linked: 'auto',
      platinum: null,
    })
    expect(entry?.achievements).toHaveLength(2)
    expect(entry?.achievements[0]).toMatchObject({
      name: 'Achievement',
      tier: 'gold',
      points: 50,
      hidden: false,
      globalPercent: 12.5,
      unlock: {
        unlockedAt: '2026-09-29T08:00:00.000Z',
        progressCurrent: 3,
        progressMax: 5,
      },
    })
    expect(entry?.achievements[1]).toMatchObject({ hidden: true, unlock: null })
  })

  it('exports a platinum the app awarded', () => {
    const { platformGameId } = seed()
    insertNewUnlocks(db, platformGameId, [
      { achievementExternalId: `${GAME_EXTERNAL_ID}-1`, unlockedAt: NOW, progress: null },
    ])
    awardPlatinums(db, NOW)

    const [entry] = buildDataExport(db, META).games[0]?.entries ?? []

    expect(entry?.platinum).toEqual({
      earnedAt: expect.any(String),
      detectedAt: expect.any(String),
    })
  })

  it('exports the links the user made by hand', () => {
    seed()
    db.prepare('INSERT INTO game_alias (match_key, game_id) VALUES (?, ?)').run('portal 2', 1)

    expect(buildDataExport(db, META).aliases).toContainEqual({ matchKey: 'portal 2', gameId: 1 })
  })

  it('exports settings with their JSON values parsed, and keeps text that is not JSON', () => {
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run('a.flag', 'true')
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run('b.object', '{"x":1}')
    db.prepare('INSERT INTO setting (key, value) VALUES (?, ?)').run('c.text', 'not json')

    expect(buildDataExport(db, META).settings).toEqual({
      'a.flag': true,
      'b.object': { x: 1 },
      'c.text': 'not json',
    })
  })

  it('never writes a platform account id, game id or achievement id', () => {
    seed()

    const text = JSON.stringify(buildDataExport(db, META))

    expect(text).not.toContain(ACCOUNT_EXTERNAL_ID)
    expect(text).not.toContain(GAME_EXTERNAL_ID)
  })
})
