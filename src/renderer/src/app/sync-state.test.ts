import { describe, expect, it } from 'vitest'
import type { AccountSummary } from '@shared/ipc'
import { syncState } from './sync-state'

function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: 1,
    platform: 'steam',
    displayName: 'Tester',
    status: 'connected',
    gameCount: 10,
    checkedGames: 10,
    lastSyncAt: new Date('2026-09-27T10:00:00Z'),
    syncing: false,
    ...overrides,
  }
}

describe('syncState', () => {
  it('says there is nothing to sync without accounts', () => {
    expect(syncState([])).toEqual({ kind: 'no_accounts' })
  })

  it('reports the newest sync across every account', () => {
    const newest = new Date('2026-09-27T11:30:00Z')

    const state = syncState([
      account({ id: 1 }),
      account({ id: 2, lastSyncAt: newest }),
      account({ id: 3, lastSyncAt: null }),
    ])

    expect(state).toEqual({ kind: 'synced', at: newest })
  })

  it('reports no time when no account has synced yet', () => {
    expect(syncState([account({ lastSyncAt: null })])).toEqual({ kind: 'synced', at: null })
  })

  it('says it is syncing while any account is', () => {
    expect(syncState([account({ id: 1 }), account({ id: 2, syncing: true })])).toEqual({
      kind: 'syncing',
    })
  })

  it.each(['needs_reauth', 'error'] as const)(
    'asks for attention when an account is %s',
    (status) => {
      expect(syncState([account({ id: 1 }), account({ id: 2, status })])).toEqual({
        kind: 'attention',
      })
    },
  )

  it('puts a running sync before a problem', () => {
    const state = syncState([
      account({ id: 1, status: 'needs_reauth' }),
      account({ id: 2, syncing: true }),
    ])

    expect(state).toEqual({ kind: 'syncing' })
  })

  it('ignores a disabled account when looking for problems', () => {
    expect(syncState([account({ status: 'disabled' })]).kind).toBe('synced')
  })
})
