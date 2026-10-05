// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSummary, ConnectResult, SteamConnectInput } from '@shared/ipc'
import { Accounts, countAccounts } from './Accounts'
import { fakeApi } from '@/test/fake-api'

const STEAM: AccountSummary = {
  id: 1,
  platform: 'steam',
  displayName: 'Steam Player',
  status: 'connected',
  gameCount: 3,
  checkedGames: 0,
  unlockedCount: 0,
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
  unlockedCount: 0,
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

const platformCards = () =>
  within(screen.getByRole('region', { name: 'Online platforms' }))
    .getAllByRole('region')
    .map((card) => card.getAttribute('aria-label'))

describe('Accounts', () => {
  it('titles the page and shows a loading status until the main process replies', () => {
    listAccounts.mockReturnValue(new Promise(() => {}))
    render(<Accounts />)

    expect(screen.getByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('offers every online platform to connect when there are no accounts', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    await screen.findByRole('region', { name: 'Online platforms' })
    expect(platformCards()).toEqual([
      'Steam, not connected',
      'Xbox, not connected',
      'PlayStation, not connected',
      'Epic, not connected',
      'Ubisoft, not connected',
      'EA, not connected',
    ])
    expect(screen.getByText('Available to connect').previousElementSibling).toHaveTextContent('6')
  })

  it('shows each account in its platform’s place, and a connect card for the rest', async () => {
    listAccounts.mockResolvedValue([XBOX, STEAM])
    render(<Accounts />)

    await screen.findByRole('region', { name: 'Online platforms' })
    expect(platformCards()).toEqual([
      'Steam: Steam Player',
      'Xbox: Xbox Player',
      'PlayStation, not connected',
      'Epic, not connected',
      'Ubisoft, not connected',
      'EA, not connected',
    ])
    expect(screen.getByText('Connected sources').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Need signing in again').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Available to connect').previousElementSibling).toHaveTextContent('4')
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

  it.each([
    ['Steam', 'Connect Steam'],
    ['Xbox', 'Connect Xbox'],
    ['PlayStation', 'Connect PlayStation'],
    ['Ubisoft', 'Connect Ubisoft'],
    ['EA', 'Connect EA'],
  ])('opens the %s sign-in flow from its card, and closes it again', async (_platform, name) => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    fireEvent.click(await screen.findByRole('button', { name }))
    expect(screen.getByRole('region', { name })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })

  it('opens the Epic flow with its code box', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Epic' }))

    expect(screen.getByRole('form', { name: 'Connect Epic Games' })).toBeInTheDocument()
  })

  it('reloads the list after an account is connected', async () => {
    listAccounts.mockResolvedValueOnce([]).mockResolvedValueOnce([STEAM])
    connectSteam.mockResolvedValue({ ok: true, account: STEAM })
    render(<Accounts />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Steam' }))

    fireEvent.change(screen.getByLabelText('SteamID64'), { target: { value: '76561190000000001' } })
    fireEvent.change(screen.getByLabelText('Steam API key'), { target: { value: 'KEY' } })
    const steamForm = screen.getByRole('form', { name: 'Connect with an API key' })
    fireEvent.click(within(steamForm).getByRole('button', { name: 'Connect' }))

    expect(await screen.findByText('Steam Player')).toBeInTheDocument()
    expect(listAccounts).toHaveBeenCalledTimes(2)
  })

  it('opens the sign-in flow under a signed-out account to reconnect it', async () => {
    listAccounts.mockResolvedValue([XBOX])
    render(<Accounts />)

    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect' }))

    expect(screen.getByRole('region', { name: 'Connect Xbox' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Connect Xbox' })).not.toBeInTheDocument()
  })

  it('reloads the list when the main process says the data changed', async () => {
    listAccounts
      .mockResolvedValueOnce([{ ...STEAM, gameCount: 0 }])
      .mockResolvedValueOnce([{ ...STEAM, gameCount: 212 }])
    render(<Accounts />)
    await screen.findByText('Steam Player')

    act(() => dataChanged())

    expect(await screen.findByText('212')).toBeInTheDocument()
  })

  it('stops listening for changes when the page closes', () => {
    listAccounts.mockReturnValue(new Promise(() => {}))
    const { unmount } = render(<Accounts />)

    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('reloads the list after an account is disconnected', async () => {
    listAccounts.mockResolvedValueOnce([STEAM]).mockResolvedValueOnce([])
    render(<Accounts />)

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove its games' }))

    expect(await screen.findByRole('button', { name: 'Connect Steam' })).toBeInTheDocument()
  })

  it('offers shadPS4 in its own Emulators section', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    const emulators = await screen.findByRole('region', { name: 'Emulators' })
    expect(
      within(emulators).getByRole('region', { name: 'shadPS4, not connected' }),
    ).toBeInTheDocument()
  })

  it('shows a connected shadPS4 account in the Emulators section', async () => {
    listAccounts.mockResolvedValue([
      { ...STEAM, id: 5, platform: 'shadps4', displayName: 'Player 1' },
    ])
    render(<Accounts />)

    const emulators = await screen.findByRole('region', { name: 'Emulators' })
    expect(within(emulators).getByRole('region', { name: 'shadPS4: Player 1' })).toBeInTheDocument()
  })

  it('offers RPCS3 beside shadPS4 in the Emulators section', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    const emulators = await screen.findByRole('region', { name: 'Emulators' })
    expect(
      within(emulators).getByRole('region', { name: 'RPCS3, not connected' }),
    ).toBeInTheDocument()
  })

  it('shows a connected RPCS3 account in the Emulators section', async () => {
    listAccounts.mockResolvedValue([{ ...STEAM, id: 6, platform: 'rpcs3', displayName: 'User' }])
    render(<Accounts />)

    const emulators = await screen.findByRole('region', { name: 'Emulators' })
    expect(within(emulators).getByRole('region', { name: 'RPCS3: User' })).toBeInTheDocument()
  })

  it('shows the RPCS3 program row under a connected RPCS3 account', async () => {
    listAccounts.mockResolvedValue([{ ...STEAM, id: 6, platform: 'rpcs3', displayName: 'User' }])
    render(<Accounts />)

    expect(await screen.findByText('Not found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose…' })).toBeInTheDocument()
  })

  it('has no RPCS3 program row before RPCS3 is connected', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    await screen.findByRole('region', { name: 'Emulators' })
    expect(screen.queryByRole('button', { name: 'Choose…' })).not.toBeInTheDocument()
  })

  it('lets a disabled shadPS4 account connect again, preselected below', async () => {
    listAccounts.mockResolvedValue([
      { ...STEAM, id: 5, platform: 'shadps4', displayName: 'Player 1', status: 'disabled' },
    ])
    window.api = fakeApi({
      listAccounts,
      onDataChanged: (listener) => {
        dataChanged = listener
        return unsubscribe
      },
      findShadPs4: vi.fn().mockResolvedValue({
        path: 'C:\\Users\\player\\AppData\\Roaming\\shadPS4',
        users: [{ id: '1000', name: 'Player 1', games: 1, unlocked: 10 }],
      }),
    })
    render(<Accounts />)

    const emulators = await screen.findByRole('region', { name: 'Emulators' })
    const disabledCard = within(emulators).getByRole('region', { name: 'shadPS4: Player 1' })
    fireEvent.click(within(disabledCard).getByRole('button', { name: 'Connect again' }))

    const radio = await within(emulators).findByRole('radio', { name: /Player 1/ })
    expect(radio).toBeChecked()
    expect(radio).toHaveFocus()
  })

  it('explains where keys live and what unofficial means', async () => {
    listAccounts.mockResolvedValue([])
    render(<Accounts />)

    expect(await screen.findByRole('heading', { name: 'Where your keys live' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'About “unofficial” sources' })).toBeInTheDocument()
  })
})

describe('countAccounts', () => {
  it('counts connected, signed-out or failing, and platforms with no active account', () => {
    expect(
      countAccounts([
        STEAM,
        XBOX,
        { ...STEAM, id: 3, platform: 'epic', status: 'error' },
        { ...STEAM, id: 4, platform: 'ea', status: 'disabled' },
      ]),
    ).toEqual({ connected: 1, needsSignIn: 2, available: 3 })
  })
})
