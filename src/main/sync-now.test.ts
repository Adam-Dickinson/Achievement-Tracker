import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { Secret } from '@shared/secret'
import { InMemorySecretStore } from '@shared/secret-store'
import { applyMigrations } from './store/migrate'
import { addPlatformGames, getAccountStatus, upsertAccount } from './store/sync-store'
import { disconnectAccount, syncNow } from './sync-now'

function setup() {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  const secrets = new InMemorySecretStore()
  const account = upsertAccount(db, { platform: 'steam', externalId: 's', displayName: 'P' })
  addPlatformGames(db, account, [
    {
      ref: { externalId: '400' },
      title: 'Portal',
      iconUrl: null,
      coverUrl: null,
      lastPlayed: null,
      recentlyPlayed: false,
    },
  ])
  secrets.save(String(account.id), new Secret('key'))
  const scheduler = {
    syncAllNow: vi.fn<() => void>(),
    syncAccountNow: vi.fn<(accountId: number) => void>(),
    syncGameNow: vi.fn<(accountId: number, gameId: string, force?: boolean) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    stopAccount: vi.fn<(accountId: number) => void>(),
  }
  const gameId = (db.prepare('SELECT game_id FROM platform_game').get() as { game_id: number })
    .game_id
  return { db, secrets, account, scheduler, gameId, deps: { db, secrets, scheduler } }
}

describe('syncNow', () => {
  it('syncs every account', async () => {
    const { scheduler, deps } = setup()

    await syncNow(deps, { kind: 'all' })

    expect(scheduler.syncAllNow).toHaveBeenCalledOnce()
  })

  it('syncs one account', async () => {
    const { scheduler, deps } = setup()

    await syncNow(deps, { kind: 'account', accountId: 3 })

    expect(scheduler.syncAccountNow).toHaveBeenCalledWith(3)
  })

  it('syncs each platform entry of a game, forced, and waits for them', async () => {
    const { scheduler, deps, account, gameId } = setup()
    let finish: () => void = () => undefined
    scheduler.syncGameNow.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )

    let done = false
    const running = syncNow(deps, { kind: 'game', gameId }).then(() => {
      done = true
    })
    await Promise.resolve()

    expect(scheduler.syncGameNow).toHaveBeenCalledWith(account.id, '400', true)
    expect(done).toBe(false)
    finish()
    await running
    expect(done).toBe(true)
  })

  it('does nothing for a game that no connected account has', async () => {
    const { scheduler, deps } = setup()

    await syncNow(deps, { kind: 'game', gameId: 999 })

    expect(scheduler.syncGameNow).not.toHaveBeenCalled()
  })
})

describe('disconnectAccount', () => {
  it('stops syncing, forgets the secret and keeps the games when asked to', () => {
    const { db, secrets, account, scheduler, deps } = setup()

    disconnectAccount(deps, { accountId: account.id, keepData: true })

    expect(scheduler.stopAccount).toHaveBeenCalledWith(account.id)
    expect(secrets.find(String(account.id))).toBeUndefined()
    expect(getAccountStatus(db, account.id)).toBe('disabled')
    expect(db.prepare('SELECT COUNT(*) AS n FROM platform_game').get()).toEqual({ n: 1 })
  })

  it('removes the account and its games otherwise', () => {
    const { db, secrets, account, scheduler, deps } = setup()

    disconnectAccount(deps, { accountId: account.id, keepData: false })

    expect(scheduler.stopAccount).toHaveBeenCalledWith(account.id)
    expect(secrets.find(String(account.id))).toBeUndefined()
    expect(getAccountStatus(db, account.id)).toBeNull()
    expect(db.prepare('SELECT COUNT(*) AS n FROM platform_game').get()).toEqual({ n: 0 })
  })
})
