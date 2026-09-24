import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type {
  AccountCredentials,
  RemoteAchievement,
  RemoteGameAchievements,
  RemoteUnlock,
} from '@shared/models'
import type { AchievementProvider } from '@shared/provider'
import { applyMigrations } from '../store/migrate'
import { getAccount } from '../store/sync-store'
import { runSyncPass } from './sync-pass'

const CREDENTIALS: AccountCredentials = { platform: 'steam', externalId: 'acc1', secret: null }

function achievement(externalId: string): RemoteAchievement {
  return {
    externalId,
    name: `Achievement ${externalId}`,
    description: null,
    iconUrl: null,
    iconLockedUrl: null,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: 10,
  }
}

function unlock(achievementExternalId: string): RemoteUnlock {
  return { achievementExternalId, unlockedAt: null, progress: null }
}

function fakeProvider(fetchGame: AchievementProvider['fetchGame']): AchievementProvider {
  const notUsed = (): never => {
    throw new Error('not used by a sync pass')
  }
  return {
    platform: 'steam',
    capabilities: {
      localWatch: false,
      polling: true,
      globalRarity: true,
      oauth: false,
      unofficial: false,
    },
    authenticate: notUsed,
    validate: notUsed,
    listGames: notUsed,
    fetchGame,
  }
}

function returning(data: RemoteGameAchievements): AchievementProvider {
  return fakeProvider(() => Promise.resolve(data))
}

function seedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  applyMigrations(db)
  db.exec(`
    INSERT INTO account (id, platform, external_id, display_name, status, created_at)
    VALUES (1, 'steam', 'acc1', 'Test Account', 'connected', '2026-01-01')
  `)
  db.exec(`INSERT INTO game (id, title, sort_title) VALUES (1, 'Hades', 'hades')`)
  db.exec(`
    INSERT INTO platform_game (id, game_id, account_id, platform, external_id, title)
    VALUES (1, 1, 1, 'steam', 'g1', 'Hades')
  `)
  return db
}

function count(db: DatabaseSync, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

function baselineDone(db: DatabaseSync): number {
  return (
    db.prepare('SELECT baseline_done FROM platform_game WHERE id = 1').get() as {
      baseline_done: number
    }
  ).baseline_done
}

describe('runSyncPass', () => {
  it('records a first sync silently: unlocks are stored but no events are returned', async () => {
    const db = seedDb()
    const provider = returning({
      achievements: [achievement('a1'), achievement('a2')],
      unlocks: [unlock('a1')],
    })

    const events = await runSyncPass(db, getAccount(db, 1), 'g1', provider, CREDENTIALS)

    expect(events).toEqual([])
    expect(count(db, 'achievement')).toBe(2)
    expect(count(db, 'unlock')).toBe(1)
    expect(baselineDone(db)).toBe(1)
  })

  it('after the baseline, returns an event for each genuinely new unlock only', async () => {
    const db = seedDb()
    const account = getAccount(db, 1)
    const achievements = [achievement('a1'), achievement('a2')]
    await runSyncPass(
      db,
      account,
      'g1',
      returning({ achievements, unlocks: [unlock('a1')] }),
      CREDENTIALS,
    )

    const events = await runSyncPass(
      db,
      account,
      'g1',
      returning({ achievements, unlocks: [unlock('a1'), unlock('a2')] }),
      CREDENTIALS,
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'steam',
      gameTitle: 'Hades',
      achievement: { externalId: 'a2', name: 'Achievement a2' },
    })
    expect(events[0]?.detectedAt).toBeInstanceOf(Date)
  })

  describe('first sync of a game found after the account was connected (baseline cutoff)', () => {
    const CUTOFF = '2026-09-23T10:00:00.000Z'

    function datedUnlock(achievementExternalId: string, at: string | null): RemoteUnlock {
      return { achievementExternalId, unlockedAt: at ? new Date(at) : null, progress: null }
    }

    it('announces only the unlocks dated after the cutoff, and records all of them', async () => {
      const db = seedDb()
      db.exec(`UPDATE platform_game SET baseline_cutoff = '${CUTOFF}' WHERE id = 1`)
      const provider = returning({
        achievements: [achievement('old'), achievement('new'), achievement('undated')],
        unlocks: [
          datedUnlock('old', '2026-09-23T09:59:59.000Z'),
          datedUnlock('new', '2026-09-23T10:00:01.000Z'),
          datedUnlock('undated', null),
        ],
      })

      const events = await runSyncPass(db, getAccount(db, 1), 'g1', provider, CREDENTIALS)

      expect(events.map((event) => event.achievement.externalId)).toEqual(['new'])
      expect(count(db, 'unlock')).toBe(3)
      expect(baselineDone(db)).toBe(1)
    })

    it('treats an unlock at exactly the cutoff as already known', async () => {
      const db = seedDb()
      db.exec(`UPDATE platform_game SET baseline_cutoff = '${CUTOFF}' WHERE id = 1`)
      const provider = returning({
        achievements: [achievement('a1')],
        unlocks: [datedUnlock('a1', CUTOFF)],
      })

      expect(await runSyncPass(db, getAccount(db, 1), 'g1', provider, CREDENTIALS)).toEqual([])
    })

    it('stays fully silent without a cutoff, however recent the unlocks', async () => {
      const db = seedDb()
      const provider = returning({
        achievements: [achievement('a1')],
        unlocks: [datedUnlock('a1', '2099-01-01T00:00:00.000Z')],
      })

      expect(await runSyncPass(db, getAccount(db, 1), 'g1', provider, CREDENTIALS)).toEqual([])
    })

    it('ignores the cutoff after the first sync: every new unlock is announced', async () => {
      const db = seedDb()
      db.exec(`UPDATE platform_game SET baseline_cutoff = '${CUTOFF}' WHERE id = 1`)
      const account = getAccount(db, 1)
      const achievements = [achievement('a1'), achievement('a2')]
      await runSyncPass(db, account, 'g1', returning({ achievements, unlocks: [] }), CREDENTIALS)

      const events = await runSyncPass(
        db,
        account,
        'g1',
        returning({ achievements, unlocks: [datedUnlock('a2', '2026-01-01T00:00:00.000Z')] }),
        CREDENTIALS,
      )

      expect(events.map((event) => event.achievement.externalId)).toEqual(['a2'])
    })
  })

  it('returns no events when nothing new has unlocked since the last pass', async () => {
    const db = seedDb()
    const account = getAccount(db, 1)
    const provider = returning({ achievements: [achievement('a1')], unlocks: [unlock('a1')] })
    await runSyncPass(db, account, 'g1', provider, CREDENTIALS)

    expect(await runSyncPass(db, account, 'g1', provider, CREDENTIALS)).toEqual([])
  })

  it('asks the provider for the right game, forwarding the credentials and abort signal', async () => {
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>(() =>
      Promise.resolve({ achievements: [], unlocks: [] }),
    )
    const signal = new AbortController().signal

    await runSyncPass(db, getAccount(db, 1), 'g1', fakeProvider(fetchGame), CREDENTIALS, signal)

    expect(fetchGame).toHaveBeenCalledWith(CREDENTIALS, { externalId: 'g1' }, signal)
  })

  it('rolls everything back if the pass fails partway through the transaction', async () => {
    const db = seedDb()
    const provider = returning({ achievements: [achievement('a1')], unlocks: [unlock('missing')] })

    await expect(runSyncPass(db, getAccount(db, 1), 'g1', provider, CREDENTIALS)).rejects.toThrow()

    expect(count(db, 'achievement')).toBe(0)
    expect(count(db, 'unlock')).toBe(0)
    expect(baselineDone(db)).toBe(0)
  })

  it('passes a provider error straight through, leaving the database untouched', async () => {
    const db = seedDb()
    const error = new ProviderError('network', 'offline')
    const provider = fakeProvider(() => Promise.reject(error))

    await expect(runSyncPass(db, getAccount(db, 1), 'g1', provider, CREDENTIALS)).rejects.toBe(
      error,
    )

    expect(count(db, 'achievement')).toBe(0)
    expect(baselineDone(db)).toBe(0)
  })

  it('throws for a game the account does not have, without calling the provider', async () => {
    const db = seedDb()
    const fetchGame = vi.fn<AchievementProvider['fetchGame']>()

    await expect(
      runSyncPass(db, getAccount(db, 1), 'unknown', fakeProvider(fetchGame), CREDENTIALS),
    ).rejects.toThrow()

    expect(fetchGame).not.toHaveBeenCalled()
  })
})
