import { RemoteAchievement, RemoteUnlock } from '@shared/models'
import { Platform } from '@shared/platform'
import { DatabaseSync } from 'node:sqlite'

export type AccountStatus = 'connected' | 'needs_reauth' | 'error' | 'disabled'

export interface AccountRow {
  readonly id: number
  readonly platform: Platform
  readonly externalId: string
}

export interface PlatformGameRow {
  readonly id: number
  readonly baselineDone: boolean
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
    .prepare('SELECT id, baseline_done FROM platform_game WHERE account_id = ? AND external_id = ?')
    .get(accountId, externalId) as { id: number; baseline_done: number } | undefined

  if (!row) {
    throw new Error(
      `Platform game with external ID ${externalId} not found for account ${accountId}`,
    )
  }

  return { id: row.id, baselineDone: row.baseline_done === 1 }
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
