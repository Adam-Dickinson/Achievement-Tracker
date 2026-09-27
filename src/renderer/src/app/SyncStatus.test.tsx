// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountSummary, TrophyLockerApi } from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { SyncStatus } from './SyncStatus'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const NOW = new Date('2026-09-27T12:00:00Z')

function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: 1,
    platform: 'steam',
    displayName: 'Tester',
    status: 'connected',
    gameCount: 10,
    checkedGames: 10,
    unlockedCount: 0,
    lastSyncAt: new Date(NOW.getTime() - 2 * 60_000),
    syncing: false,
    ...overrides,
  }
}

function withAccounts(accounts: AccountSummary[], overrides: Partial<TrophyLockerApi> = {}) {
  window.api = fakeApi({ listAccounts: vi.fn().mockResolvedValue(accounts), ...overrides })
}

function freezeClock() {
  vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] })
}

describe('SyncStatus', () => {
  it('says how long ago the newest sync was', async () => {
    freezeClock()
    withAccounts([account()])
    render(<SyncStatus onOpenAccounts={() => {}} />)

    const button = await screen.findByRole('button', { name: 'Synced 2m ago, sync all now' })
    expect(button).toHaveTextContent('Synced 2m ago')
  })

  it('keeps the time ago up to date', async () => {
    freezeClock()
    withAccounts([account()])
    render(<SyncStatus onOpenAccounts={() => {}} />)
    await screen.findByText('Synced 2m ago')

    act(() => vi.advanceTimersByTime(60_000))

    expect(screen.getByText('Synced 3m ago')).toBeInTheDocument()
  })

  it('says when no account has synced yet', async () => {
    withAccounts([account({ lastSyncAt: null })])
    render(<SyncStatus onOpenAccounts={() => {}} />)

    expect(await screen.findByText('Not synced yet')).toBeInTheDocument()
  })

  it('syncs everything when clicked, showing progress until it finishes', async () => {
    let finish = () => {}
    const syncNow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    withAccounts([account()], { syncNow })
    render(<SyncStatus onOpenAccounts={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /sync all now/ }))

    expect(syncNow).toHaveBeenCalledExactlyOnceWith({ kind: 'all' })
    const busy = screen.getByRole('button', { name: 'Syncing…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')

    await act(async () => finish())

    expect(screen.getByRole('button', { name: /sync all now/ })).toBeEnabled()
  })

  it('shows a sync already running', async () => {
    withAccounts([account({ syncing: true })])
    render(<SyncStatus onOpenAccounts={() => {}} />)

    expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeDisabled()
  })

  it.each([
    ['no account is connected', [], 'Connect an account'],
    ['an account needs signing in again', [account({ status: 'needs_reauth' })], 'Check accounts'],
  ])('opens Accounts when %s', async (_label, accounts, name) => {
    const onOpenAccounts = vi.fn()
    withAccounts(accounts)
    render(<SyncStatus onOpenAccounts={onOpenAccounts} />)

    fireEvent.click(await screen.findByRole('button', { name }))

    expect(onOpenAccounts).toHaveBeenCalledOnce()
    expect(window.api.syncNow).not.toHaveBeenCalled()
  })

  it('shows nothing until the accounts are known', () => {
    withAccounts([], { listAccounts: vi.fn().mockReturnValue(new Promise(() => {})) })
    const { container } = render(<SyncStatus onOpenAccounts={() => {}} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('reloads the accounts when the data changes', async () => {
    let changed = () => {}
    const listAccounts = vi
      .fn()
      .mockResolvedValueOnce([account()])
      .mockResolvedValueOnce([account({ syncing: true })])
    withAccounts([], {
      listAccounts,
      onDataChanged: vi.fn((listener: () => void) => {
        changed = listener
        return () => {}
      }),
    })
    render(<SyncStatus onOpenAccounts={() => {}} />)
    await screen.findByRole('button', { name: /sync all now/ })

    act(() => changed())

    expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeInTheDocument()
  })
})
