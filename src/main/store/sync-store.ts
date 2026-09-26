import type { AccountSummary } from '@shared/ipc'
import { AccountStatus, RemoteAchievement, RemoteGame, RemoteUnlock } from '@shared/models'
import { Platform } from '@shared/platform'
import { DatabaseSync } from 'node:sqlite'
import { gameForTitle } from './game-links'

export interface AccountRow {
  readonly id: number
  readonly platform: Platform
  readonly externalId: string
}

export interface PlatformGameRow {
  readonly id: number
  readonly title: string
  readonly baselineDone: boolean
  readonly baselineCutoff: Date | null
}

export interface SyncStateRow {
  readonly cursor: string | null
  readonly lastOkAt: Date | null
  readonly lastError: string | null
  readonly nextDueAt: Date | null
}

export function getPlatformGameByExternalId(
  db: DatabaseSync,
  accountId: number,
  externalId: string,
): PlatformGameRow {
  const row = db
    .prepare(
      'SELECT id, title, baseline_done, baseline_cutoff FROM platform_game WHERE account_id = ? AND external_id = ?',
    )
    .get(accountId, externalId) as
    { id: number; title: string; baseline_done: number; baseline_cutoff: string | null } | undefined

  if (!row) {
    throw new Error(
      `Platform game with external ID ${externalId} not found for account ${accountId}`,
    )
  }

  return {
    id: row.id,
    title: row.title,
    baselineDone: row.baseline_done === 1,
    baselineCutoff: row.baseline_cutoff ? new Date(row.baseline_cutoff) : null,
  }
}

export function upsertAchievements(
  db: DatabaseSync,
  platformGameId: number,
  achievements: readonly RemoteAchievement[],
): void {
  const statement = db.prepare(`
    INSERT INTO achievement (
      platform_game_id, external_id, name, description, icon_url, icon_locked_url,
      hidden, points, tier, global_percent
      )
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(platform_game_id, external_id) DO UPDATE SET
        name=excluded.name,
        description=excluded.description,
        icon_url=excluded.icon_url,
        icon_locked_url=excluded.icon_locked_url,
        hidden=excluded.hidden,
        points=excluded.points,
        tier=excluded.tier,
        global_percent=excluded.global_percent
  `)

  for (const achievement of achievements) {
    statement.run(
      platformGameId,
      achievement.externalId,
      achievement.name,
      achievement.description,
      achievement.iconUrl,
      achievement.iconLockedUrl,
      achievement.hidden ? 1 : 0,
      achievement.points,
      achievement.tier,
      achievement.globalPercent,
    )
  }
}

export function insertNewUnlocks(
  db: DatabaseSync,
  platformGameId: number,
  unlocks: readonly RemoteUnlock[],
): RemoteUnlock[] {
  const findAchievementId = db.prepare(`
    SELECT id FROM achievement WHERE platform_game_id = ? AND external_id = ?`)
  const insertUnlock = db.prepare(`
    INSERT OR IGNORE INTO unlock (achievement_id, unlocked_at, detected_at, progress_cur, progress_max)
    VALUES (?,?,?,?,?)
  `)

  const detectedAt = new Date().toISOString()
  const newUnlocks: RemoteUnlock[] = []

  for (const unlock of unlocks) {
    const achievementId = findAchievementId.get(platformGameId, unlock.achievementExternalId) as
      { id: number } | undefined

    if (!achievementId)
      throw new Error(
        'Achivement Id not found for platform and external Id' +
          platformGameId +
          ' ' +
          unlock.achievementExternalId,
      )

    const result = insertUnlock.run(
      achievementId.id,
      unlock.unlockedAt ? unlock.unlockedAt.toISOString() : null,
      detectedAt,
      unlock.progress?.current ?? null,
      unlock.progress?.max ?? null,
    )

    if (result.changes === 1) newUnlocks.push(unlock)
  }
  return newUnlocks
}

export function setBaselineDone(db: DatabaseSync, platformGameId: number): void {
  db.prepare(`UPDATE platform_game SET baseline_done = 1 WHERE id = ?`).run(platformGameId)
}

export function getSyncState(
  db: DatabaseSync,
  accountId: number,
  scope: string,
): SyncStateRow | null {
  const row = db
    .prepare(
      'SELECT cursor, last_ok_at, last_error, next_due_at FROM sync_state WHERE account_id = ? AND scope = ?',
    )
    .get(accountId, scope) as
    | {
        cursor: string | null
        last_ok_at: string | null
        last_error: string | null
        next_due_at: string | null
      }
    | undefined

  if (!row) return null

  return {
    cursor: row.cursor,
    lastOkAt: row.last_ok_at ? new Date(row.last_ok_at) : null,
    lastError: row.last_error,
    nextDueAt: row.next_due_at ? new Date(row.next_due_at) : null,
  }
}

export function upsertSyncState(
  db: DatabaseSync,
  accountId: number,
  scope: string,
  state: {
    cursor: string | null
    lastOkAt: Date | null
    lastError: string | null
    nextDueAt: Date | null
  },
): void {
  db.prepare(
    `
    INSERT INTO sync_state (account_id, scope, cursor, last_ok_at, last_error, next_due_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(account_id, scope) DO UPDATE SET
      cursor=excluded.cursor,
      last_ok_at=excluded.last_ok_at,
      last_error=excluded.last_error,
      next_due_at=excluded.next_due_at
  `,
  ).run(
    accountId,
    scope,
    state.cursor,
    state.lastOkAt ? state.lastOkAt.toISOString() : null,
    state.lastError,
    state.nextDueAt ? state.nextDueAt.toISOString() : null,
  )
}

export function getAccount(db: DatabaseSync, accountId: number): AccountRow {
  const row = db
    .prepare('SELECT id, platform, external_id FROM account WHERE id = ?')
    .get(accountId) as { id: number; platform: Platform; external_id: string } | undefined

  if (!row) {
    throw new Error(`Account ${accountId} not found`)
  }

  return { id: row.id, platform: row.platform, externalId: row.external_id }
}

export function setAccountStatus(db: DatabaseSync, accountId: number, status: AccountStatus): void {
  db.prepare('UPDATE account SET status = ? WHERE id = ?').run(status, accountId)
}

export function listAccountSummaries(db: DatabaseSync): AccountSummary[] {
  const rows = db
    .prepare(
      `
    SELECT account.id, account.platform, account.display_name, account.status,
           COUNT(platform_game.id) AS game_count
    FROM account
    LEFT JOIN platform_game ON platform_game.account_id = account.id
    GROUP BY account.id
    ORDER BY account.id
  `,
    )
    .all() as {
    id: number
    platform: Platform
    display_name: string
    status: AccountStatus
    game_count: number
  }[]

  return rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    displayName: row.display_name,
    status: row.status,
    gameCount: row.game_count,
  }))
}

export function listConnectedAccounts(db: DatabaseSync): AccountRow[] {
  const rows = db
    .prepare("SELECT id, platform, external_id FROM account WHERE status = 'connected' ORDER BY id")
    .all() as { id: number; platform: Platform; external_id: string }[]

  return rows.map((row) => ({ id: row.id, platform: row.platform, externalId: row.external_id }))
}

export function upsertAccount(
  db: DatabaseSync,
  account: { platform: Platform; externalId: string; displayName: string },
  now = new Date(),
): AccountRow {
  const row = db
    .prepare(
      `
    INSERT INTO account (platform, external_id, display_name, status, created_at)
    VALUES (?, ?, ?, 'connected', ?)
    ON CONFLICT(platform, external_id) DO UPDATE SET
      display_name = excluded.display_name,
      status = 'connected'
    RETURNING id
  `,
    )
    .get(account.platform, account.externalId, account.displayName, now.toISOString()) as {
    id: number
  }

  return { id: row.id, platform: account.platform, externalId: account.externalId }
}

export function addPlatformGames(
  db: DatabaseSync,
  account: AccountRow,
  games: readonly RemoteGame[],
  baselineCutoff: Date | null = null,
): number {
  const findGame = db.prepare(
    'SELECT id FROM platform_game WHERE account_id = ? AND external_id = ?',
  )
  const updateGame = db.prepare(`
    UPDATE platform_game
    SET title = ?, icon_url = ?, cover_url = COALESCE(?, cover_url),
        last_played = COALESCE(?, last_played)
    WHERE id = ?
  `)
  const insertPlatformGame = db.prepare(`
    INSERT INTO platform_game
      (game_id, account_id, platform, external_id, title, icon_url, cover_url, last_played,
       baseline_done, baseline_cutoff)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `)

  let added = 0
  for (const game of games) {
    const lastPlayed = game.lastPlayed?.toISOString() ?? null
    const existing = findGame.get(account.id, game.ref.externalId) as { id: number } | undefined

    if (existing) {
      updateGame.run(game.title, game.iconUrl, game.coverUrl, lastPlayed, existing.id)
      continue
    }

    insertPlatformGame.run(
      gameForTitle(db, game.title),
      account.id,
      account.platform,
      game.ref.externalId,
      game.title,
      game.iconUrl,
      game.coverUrl,
      lastPlayed,
      baselineCutoff?.toISOString() ?? null,
    )
    added++
  }
  return added
}

export function listPlatformGameExternalIds(db: DatabaseSync, accountId: number): string[] {
  const rows = db
    .prepare('SELECT external_id FROM platform_game WHERE account_id = ? ORDER BY id')
    .all(accountId) as { external_id: string }[]

  return rows.map((row) => row.external_id)
}
