// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSummary } from '@shared/ipc'
import type { AccountStatus } from '@shared/models'
import { fakeApi } from '@/test/fake-api'
import { AccountCard } from './AccountCard'

afterEach(cleanup)

function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: 1,
    platform: 'steam',
    displayName: 'Test Player',
    status: 'connected',
    gameCount: 12,
    checkedGames: 12,
    lastSyncAt: null,
    syncing: false,
    ...overrides,
  }
}

describe('AccountCard', () => {
  it('shows the platform, the display name, the status and the game count', () => {
    render(<AccountCard account={account()} />)

    expect(screen.getByText('Steam')).toBeInTheDocument()
    expect(screen.getByText('Test Player')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('12 games')).toBeInTheDocument()
  })

  it('uses the platform name rather than its id', () => {
    render(<AccountCard account={account({ platform: 'retroachievements' })} />)

    expect(screen.getByText('RetroAchievements')).toBeInTheDocument()
  })

  it.each([
    [0, '0 games'],
    [1, '1 game'],
    [2, '2 games'],
  ])('says %i game(s) correctly', (gameCount, text) => {
    render(<AccountCard account={account({ gameCount })} />)

    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('groups a large game count', () => {
    render(<AccountCard account={account({ gameCount: 1204 })} />)

    const expected = `${(1204).toLocaleString()} games`.replace(/\s/g, ' ')
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it.each<[AccountStatus, string]>([
    ['connected', 'Connected'],
    ['needs_reauth', 'Needs reconnecting'],
    ['error', 'Error'],
    ['disabled', 'Disconnected'],
  ])('labels the %s status', (status, label) => {
    render(<AccountCard account={account({ status })} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('AccountCard sync status', () => {
  it('shows how many games the first sync has read, with a progress bar', () => {
    render(<AccountCard account={account({ syncing: true, checkedGames: 3, gameCount: 12 })} />)

    expect(screen.getByText('Syncing… 3 of 12 games read')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Steam sync progress' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    )
  })

  it('just says it is syncing once every game has been read', () => {
    render(<AccountCard account={account({ syncing: true })} />)

    expect(screen.getByText('Syncing…', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('says when it last synced, or that it has not yet', () => {
    const lastSyncAt = new Date(2026, 8, 20, 13, 42)
    const { rerender } = render(<AccountCard account={account({ lastSyncAt })} />)
    expect(
      screen.getByText(
        `Last synced: ${lastSyncAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
      ),
    ).toBeInTheDocument()

    rerender(<AccountCard account={account()} />)
    expect(screen.getByText('Not synced yet')).toBeInTheDocument()
  })

  it('tells a signed-out account how to reconnect, and offers no sync', () => {
    render(<AccountCard account={account({ status: 'needs_reauth' })} />)

    expect(screen.getByText(/Connect it again with the Steam card above/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument()
  })
})

describe('AccountCard actions', () => {
  const onChanged = vi.fn()

  beforeEach(() => {
    window.api = fakeApi()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('syncs the account on request, then asks for a reload', async () => {
    render(<AccountCard account={account()} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    expect(window.api.syncNow).toHaveBeenCalledWith({ kind: 'account', accountId: 1 })
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  })

  it('disables Sync now while the account is syncing', () => {
    render(<AccountCard account={account({ syncing: true })} />)

    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled()
  })

  it.each([
    ['Keep its games', true],
    ['Remove its games', false],
  ])('disconnects after asking, with "%s"', async (choice, keepData) => {
    render(<AccountCard account={account()} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }))
    const confirm = screen.getByRole('group', { name: 'Disconnect Test Player' })
    fireEvent.click(within(confirm).getByRole('button', { name: choice }))

    expect(window.api.disconnectAccount).toHaveBeenCalledWith({ accountId: 1, keepData })
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(screen.queryByRole('group', { name: 'Disconnect Test Player' })).not.toBeInTheDocument()
  })

  it('does nothing when the disconnect is cancelled', () => {
    render(<AccountCard account={account()} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('group', { name: 'Disconnect Test Player' })).not.toBeInTheDocument()
    expect(window.api.disconnectAccount).not.toHaveBeenCalled()
  })

  it('offers only removal for an account that is already disconnected', () => {
    render(<AccountCard account={account({ status: 'disabled' })} />)

    expect(screen.getByText(/Not syncing. Its games stay in your library/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove…' }))

    const confirm = screen.getByRole('group', { name: 'Disconnect Test Player' })
    expect(
      within(confirm)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Remove its games', 'Cancel'])
  })

  it('says so when a disconnect fails', async () => {
    window.api = fakeApi({ disconnectAccount: vi.fn().mockRejectedValue(new Error('boom')) })
    render(<AccountCard account={account()} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove its games' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(onChanged).not.toHaveBeenCalled()
  })
})
