// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSummary } from '@shared/ipc'
import type { AccountStatus } from '@shared/models'
import { fakeApi } from '@/test/fake-api'
import { AccountCard } from './AccountCard'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: 1,
    platform: 'steam',
    displayName: 'Test Player',
    status: 'connected',
    gameCount: 12,
    checkedGames: 12,
    unlockedCount: 340,
    lastSyncAt: null,
    syncing: false,
    ...overrides,
  }
}

const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling

describe('AccountCard', () => {
  it('names the platform and the account, with its status and whether the source is official', () => {
    render(<AccountCard account={account()} />)

    const card = screen.getByRole('region', { name: 'Steam: Test Player' })
    expect(within(card).getByRole('heading', { name: 'Steam' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Test Player')
    expect(card).toHaveTextContent('Connected')
    expect(card).toHaveTextContent('Official API')
  })

  it('labels the unofficial sources', () => {
    render(<AccountCard account={account({ platform: 'ubisoft' })} />)

    expect(screen.getByRole('heading', { name: 'Ubisoft' })).toBeInTheDocument()
    expect(screen.getByText('Unofficial · opt-in')).toBeInTheDocument()
  })

  it('shows the games, unlocks and when it last synced', () => {
    vi.useFakeTimers({ now: new Date('2026-09-27T12:00:00Z'), toFake: ['Date'] })
    render(
      <AccountCard
        account={account({ gameCount: 1234, lastSyncAt: new Date('2026-09-27T11:58:00Z') })}
      />,
    )

    expect(stat('Games')?.textContent).toBe((1234).toLocaleString())
    expect(stat('Unlocked')).toHaveTextContent('340')
    expect(stat('Last sync')).toHaveTextContent('2m ago')
  })

  it('says it has not synced yet', () => {
    render(<AccountCard account={account()} />)

    expect(stat('Last sync')).toHaveTextContent('Not yet')
  })

  it.each([
    ['needs_reauth', 'Needs signing in'],
    ['error', 'Error'],
    ['disabled', 'Disconnected'],
  ] as [AccountStatus, string][])('labels the %s status', (status, label) => {
    render(<AccountCard account={account({ status })} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('AccountCard sync status', () => {
  it('shows how many games the first sync has read, with a progress bar', () => {
    render(<AccountCard account={account({ syncing: true, gameCount: 386, checkedGames: 120 })} />)

    expect(screen.getByText('Syncing… 120 of 386 games read')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Steam sync progress' })).toHaveAttribute(
      'aria-valuenow',
      '31',
    )
    expect(stat('Last sync')).toHaveTextContent('Syncing…')
  })

  it('just says it is syncing once every game has been read', () => {
    render(<AccountCard account={account({ syncing: true })} />)

    expect(stat('Last sync')).toHaveTextContent('Syncing…')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('tells a signed-out account to reconnect, and offers Reconnect in place of Resync', () => {
    const onReconnect = vi.fn()
    render(<AccountCard account={account({ status: 'needs_reauth' })} onReconnect={onReconnect} />)

    expect(screen.getByText(/Steam signed this account out. Reconnect/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resync' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))

    expect(onReconnect).toHaveBeenCalledOnce()
  })

  it('offers to connect a disconnected account again', () => {
    const onReconnect = vi.fn()
    render(<AccountCard account={account({ status: 'disabled' })} onReconnect={onReconnect} />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect again' }))

    expect(onReconnect).toHaveBeenCalledOnce()
  })
})

describe('AccountCard actions', () => {
  const onChanged = vi.fn()

  beforeEach(() => {
    onChanged.mockReset()
    window.api = fakeApi()
  })

  it('syncs the account on request, then asks for a reload', async () => {
    render(<AccountCard account={account()} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: 'Resync' }))

    expect(window.api.syncNow).toHaveBeenCalledWith({ kind: 'account', accountId: 1 })
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  })

  it('disables Resync while the account is syncing', () => {
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
    expect(screen.queryByRole('button', { name: 'Resync' })).not.toBeInTheDocument()
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
