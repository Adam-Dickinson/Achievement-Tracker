// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSummary, ConnectResult, SteamConnectInput } from '@shared/ipc'
import { Accounts } from './Accounts'
import { fakeApi } from '@/test/fake-api'

const STEAM: AccountSummary = {
  id: 1,
  platform: 'steam',
  displayName: 'Steam Player',
  status: 'connected',
  gameCount: 3,
  checkedGames: 0,
  lastSyncAt: null,
  syncing: false,
}
const XBOX: AccountSummary = {
  id: 2,
  platform: 'xbox',
  displayName: 'Xbox Player',
  status: 'needs_reauth',
  gameCount: 0,
  checkedGames: 0,
  lastSyncAt: null,
  syncing: false,
}

const listAccounts = vi.fn<() => Promise<AccountSummary[]>>()
const connectSteam = vi.fn<(input: SteamConnectInput) => Promise<ConnectResult>>()
const unsubscribe = vi.fn()
let dataChanged: () => void = () => {}

beforeEach(() => {
  window.api = fakeApi({
    listAccounts,
    connectSteam,
    onDataChanged: (listener) => {
      dataChanged = listener
      return unsubscribe
    },
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Accounts', () => {
  it('shows a loading status until the main process replies', () => {
    listAccounts.mockReturnValue(new Promise(() => {}))
    render(<Accounts />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('says so when no account is connected', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    expect(await screen.findByText('No accounts connected yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('lists every account, in the order the main process gives them', async () => {
    listAccounts.mockResolvedValue([STEAM, XBOX])
    render(<Accounts />)

    const items = within(await screen.findByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Steam Player')
    expect(items[1]).toHaveTextContent('Xbox Player')
    expect(items[1]).toHaveTextContent('Needs reconnecting')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(listAccounts).toHaveBeenCalledOnce()
  })

  it('still loads under StrictMode, where effects run twice', async () => {
    listAccounts.mockResolvedValue([STEAM])
    render(
      <StrictMode>
        <Accounts />
      </StrictMode>,
    )

    expect(await screen.findByText('Steam Player')).toBeInTheDocument()
  })

  it('shows the Steam connect form', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    expect(screen.getByRole('form', { name: 'Connect with an API key' })).toBeInTheDocument()
    await screen.findByText('No accounts connected yet.')
  })

  it('shows the Epic connect card', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    expect(screen.getByRole('form', { name: 'Connect Epic Games' })).toBeInTheDocument()
    await screen.findByText('No accounts connected yet.')
  })

  it('shows the Ubisoft connect card', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    expect(screen.getByRole('region', { name: 'Connect Ubisoft' })).toBeInTheDocument()
    await screen.findByText('No accounts connected yet.')
  })

  it('shows the Steam card with its sign-in and the API key fallback', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    expect(screen.getByRole('region', { name: 'Connect Steam' })).toBeInTheDocument()
    await screen.findByText('No accounts connected yet.')
  })

  it('shows the EA connect card', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    expect(screen.getByRole('region', { name: 'Connect EA' })).toBeInTheDocument()
    await screen.findByText('No accounts connected yet.')
  })

  it('shows the PlayStation connect card', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    expect(screen.getByRole('region', { name: 'Connect PlayStation' })).toBeInTheDocument()
    await screen.findByText('No accounts connected yet.')
  })

  it('reloads the list after an account is connected', async () => {
    listAccounts.mockResolvedValueOnce([]).mockResolvedValueOnce([STEAM])
    connectSteam.mockResolvedValue({ ok: true, account: STEAM })
    render(<Accounts />)
    await screen.findByText('No accounts connected yet.')

    fireEvent.change(screen.getByLabelText('SteamID64'), { target: { value: '76561190000000001' } })
    fireEvent.change(screen.getByLabelText('Steam API key'), { target: { value: 'KEY' } })
    const steamForm = screen.getByRole('form', { name: 'Connect with an API key' })
    fireEvent.click(within(steamForm).getByRole('button', { name: 'Connect' }))

    expect(await screen.findByText('Steam Player')).toBeInTheDocument()
    expect(listAccounts).toHaveBeenCalledTimes(2)
  })

  it('reloads the list when the main process says the data changed', async () => {
    listAccounts
      .mockResolvedValueOnce([{ ...STEAM, gameCount: 0 }])
      .mockResolvedValueOnce([{ ...STEAM, gameCount: 212 }])
    render(<Accounts />)
    expect(await screen.findByText('0 games')).toBeInTheDocument()

    act(() => dataChanged())

    expect(await screen.findByText('212 games')).toBeInTheDocument()
  })

  it('stops listening for changes when the page closes', () => {
    listAccounts.mockReturnValue(new Promise(() => {}))
    const { unmount } = render(<Accounts />)

    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('Accounts: syncing', () => {
  it('syncs every account from Sync all', async () => {
    listAccounts.mockResolvedValue([STEAM, XBOX])
    render(<Accounts />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sync all' }))

    expect(window.api.syncNow).toHaveBeenCalledWith({ kind: 'all' })
  })

  it('offers no Sync all when no account is connected', async () => {
    listAccounts.mockResolvedValue([XBOX])
    render(<Accounts />)

    await screen.findByText('Xbox Player')
    expect(screen.queryByRole('button', { name: 'Sync all' })).not.toBeInTheDocument()
  })

  it('reloads the list after an account is disconnected', async () => {
    listAccounts.mockResolvedValueOnce([STEAM]).mockResolvedValueOnce([])
    render(<Accounts />)

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove its games' }))

    expect(await screen.findByText('No accounts connected yet.')).toBeInTheDocument()
  })
})
