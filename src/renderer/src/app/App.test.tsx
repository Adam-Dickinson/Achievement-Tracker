// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSummary } from '@shared/ipc'
import { App } from './App'
import { fakeApi } from '@/test/fake-api'
import { fakeLayout } from '@/test/layout'

const STEAM_ACCOUNT: AccountSummary = {
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

const sendTestNotification = vi.fn()
let restoreLayout: () => void

beforeEach(() => {
  restoreLayout = fakeLayout()
  window.api = fakeApi({
    sendTestNotification,
  })
})

afterEach(() => {
  cleanup()
  restoreLayout()
  vi.clearAllMocks()
})

describe('App', () => {
  it('starts on the dashboard and switches page when a nav item is clicked', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Library' }))

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('img', { name: 'adam' })).toBeInTheDocument()
  })

  it('shows the Accounts screen on the Accounts page', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Accounts' }))

    expect(await screen.findByRole('region', { name: 'Online platforms' })).toBeInTheDocument()
    expect(window.api.listAccounts).toHaveBeenCalled()
  })

  it('shows the Artwork settings on the Settings page', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))

    expect(await screen.findByRole('region', { name: 'Artwork' })).toBeInTheDocument()
    expect(window.api.getArtworkSettings).toHaveBeenCalled()
  })

  it('shows the Activity timeline on the Activity page', async () => {
    window.api = fakeApi({
      listActivity: vi.fn().mockResolvedValue({ unlocks: [], hasMore: false }),
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Activity' }))

    expect(await screen.findByText(/Nothing unlocked yet/)).toBeInTheDocument()
    expect(window.api.listActivity).toHaveBeenCalledOnce()
  })

  it('sends a test toast from the Settings page', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Send test toast' }))

    expect(sendTestNotification).toHaveBeenCalledOnce()
    expect(await screen.findByText('Trophy Locker v0.1.0 · database schema 1')).toBeInTheDocument()
  })

  it('searches the Library from the top bar on any page', async () => {
    window.api = fakeApi({
      listLibrary: vi.fn().mockResolvedValue([
        {
          id: 7,
          title: 'Portal',
          platforms: ['steam'],
          coverUrl: null,
          unlocked: 1,
          total: 2,
          lastUnlockAt: null,
        },
      ]),
      listActivity: vi.fn().mockResolvedValue({ unlocks: [], hasMore: false }),
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Activity' }))

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search library' }), {
      target: { value: 'port' },
    })

    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('Showing 1 of 1 game')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search library' })).toHaveValue('port')
  })
})

describe('App: onboarding', () => {
  it('shows onboarding when it has not been completed and no account is connected', async () => {
    window.api = fakeApi({
      getOnboardingCompleted: vi.fn().mockResolvedValue(false),
      listAccounts: vi.fn().mockResolvedValue([]),
    })
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Welcome to Trophy Locker' }),
    ).toBeInTheDocument()
  })

  it('skips onboarding once an account exists, even if it was never completed', async () => {
    window.api = fakeApi({
      getOnboardingCompleted: vi.fn().mockResolvedValue(false),
      listAccounts: vi.fn().mockResolvedValue([STEAM_ACCOUNT]),
    })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Welcome to Trophy Locker' }),
    ).not.toBeInTheDocument()
  })

  it('finishing onboarding marks it complete and shows the normal app', async () => {
    const completeOnboarding = vi.fn().mockResolvedValue(undefined)
    window.api = fakeApi({
      getOnboardingCompleted: vi.fn().mockResolvedValue(false),
      completeOnboarding,
      listAccounts: vi.fn().mockResolvedValue([]),
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Skip setup' }))

    expect(completeOnboarding).toHaveBeenCalledOnce()
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows neither onboarding nor the normal app while the decision is still loading', () => {
    window.api = fakeApi({
      getOnboardingCompleted: vi.fn().mockReturnValue(new Promise(() => {})),
      listAccounts: vi.fn().mockReturnValue(new Promise(() => {})),
    })
    render(<App />)

    expect(screen.queryByRole('button', { name: 'Library' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Welcome to Trophy Locker' }),
    ).not.toBeInTheDocument()
    expect(window.api.getDashboard).not.toHaveBeenCalled()
  })

  it('marks onboarding complete on the first connect, and keeps the wizard up until Done', async () => {
    let dataChanged: () => void = () => {}
    let connected: AccountSummary[] = []
    const completeOnboarding = vi.fn().mockResolvedValue(undefined)
    const listAccounts = vi.fn(() => Promise.resolve(connected))
    window.api = fakeApi({
      getOnboardingCompleted: vi.fn().mockResolvedValue(false),
      completeOnboarding,
      listAccounts,
      connectSteam: vi.fn(() => {
        connected = [STEAM_ACCOUNT]
        return Promise.resolve({ ok: true as const, account: STEAM_ACCOUNT })
      }),
      onDataChanged: (listener) => {
        dataChanged = listener
        return () => {}
      },
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Get started' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect Steam' }))
    fireEvent.change(screen.getByLabelText('SteamID64'), { target: { value: '76561190000000001' } })
    fireEvent.change(screen.getByLabelText('Steam API key'), { target: { value: 'KEY' } })
    fireEvent.click(
      within(screen.getByRole('form', { name: 'Connect with an API key' })).getByRole('button', {
        name: 'Connect',
      }),
    )
    await screen.findByRole('region', { name: 'Steam, connected' })

    expect(completeOnboarding).toHaveBeenCalledOnce()

    const fetchesBefore = listAccounts.mock.calls.length
    act(() => dataChanged())
    await vi.waitFor(() => expect(listAccounts.mock.calls.length).toBeGreaterThan(fetchesBefore))
    await act(async () => {})

    expect(screen.getByRole('heading', { name: 'Connect your platforms' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(completeOnboarding).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to Dashboard' }))

    expect(completeOnboarding).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})

describe('App: opening a game', () => {
  const PORTAL = {
    id: 7,
    title: 'Portal',
    platforms: ['steam' as const],
    coverUrl: null,
    unlocked: 1,
    total: 2,
    lastUnlockAt: null,
  }

  beforeEach(() => {
    window.api = fakeApi({
      listLibrary: vi.fn().mockResolvedValue([PORTAL]),
      getGame: vi.fn().mockResolvedValue({
        game: PORTAL,
        entries: [
          {
            platformGameId: 70,
            platform: 'steam',
            tag: null,
            title: 'Portal',
            unlocked: 1,
            total: 2,
            achievements: [],
          },
        ],
      }),
    })
  })

  it('opens a game from the Library, and goes back to it', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Library' }))

    fireEvent.click(await screen.findByRole('button', { name: /Portal/ }))
    expect(await screen.findByRole('heading', { name: 'Portal' })).toBeInTheDocument()
    expect(window.api.getGame).toHaveBeenCalledWith(7)

    fireEvent.click(screen.getByRole('button', { name: 'Library', current: false }))
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument()
  })

  it('keeps the Library search, sort and view after going back from a game', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Library' }))
    await screen.findByRole('list', { name: 'Games' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search library' }), {
      target: { value: 'port' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), {
      target: { value: 'completion' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'List' }))

    fireEvent.click(screen.getByRole('button', { name: /Portal/ }))
    await screen.findByRole('heading', { name: 'Portal' })
    fireEvent.click(screen.getByRole('button', { name: 'Library', current: false }))

    await screen.findByRole('list', { name: 'Games' })
    expect(screen.getByRole('searchbox', { name: 'Search library' })).toHaveValue('port')
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('completion')
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('goes back to the Library when searching from the top bar with a game open', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Library' }))
    fireEvent.click(await screen.findByRole('button', { name: /Portal/ }))
    await screen.findByRole('heading', { name: 'Portal' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search library' }), {
      target: { value: 'por' },
    })

    expect(await screen.findByRole('list', { name: 'Games' })).toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 1 game')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Portal' })).not.toBeInTheDocument()
  })

  it('goes back to where the Library was scrolled, and starts a game at the top', async () => {
    const { container } = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Library' }))
    const card = await screen.findByRole('button', { name: /Portal/ })
    const main = container.firstElementChild as HTMLElement
    main.scrollTop = 500

    fireEvent.click(card)
    await screen.findByRole('heading', { name: 'Portal' })
    expect(main.scrollTop).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Library', current: false }))
    await screen.findByRole('list', { name: 'Games' })
    expect(main.scrollTop).toBe(500)
  })

  it('starts each page at the top', async () => {
    const { container } = render(<App />)
    const activity = await screen.findByRole('button', { name: 'Activity' })
    const main = container.firstElementChild as HTMLElement
    main.scrollTop = 300

    fireEvent.click(activity)

    expect(main.scrollTop).toBe(0)
  })

  it('opens a game from Activity on the tab of the unlock that was clicked', async () => {
    window.api = fakeApi({
      getGame: window.api.getGame,
      listActivity: vi.fn().mockResolvedValue({
        unlocks: [
          {
            achievementId: 1,
            gameId: 7,
            platformGameId: 71,
            gameTitle: 'Portal',
            platform: 'xbox',
            name: 'Test Subject',
            description: null,
            iconUrl: null,
            globalPercent: null,
            platinum: false,
            kind: 'achievement',
            unlockedAt: new Date(),
          },
        ],
        hasMore: false,
      }),
    })
    vi.mocked(window.api.getGame).mockResolvedValue({
      game: { ...PORTAL, platforms: ['steam', 'xbox'] },
      entries: [
        {
          platformGameId: 70,
          platform: 'steam',
          tag: null,
          title: 'Portal',
          unlocked: 1,
          total: 2,
          achievements: [],
          appPlatinum: null,
          hasStorePage: false,
        },
        {
          platformGameId: 71,
          platform: 'xbox',
          tag: null,
          title: 'Portal',
          unlocked: 0,
          total: 2,
          achievements: [],
          appPlatinum: null,
          hasStorePage: false,
        },
      ],
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Activity' }))

    fireEvent.click(await screen.findByRole('button', { name: /Test Subject/ }))

    expect(await screen.findByRole('tab', { name: /Xbox/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('leaves a game when another page is picked in the nav', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Library' }))
    fireEvent.click(await screen.findByRole('button', { name: /Portal/ }))
    await screen.findByRole('heading', { name: 'Portal' })

    fireEvent.click(screen.getByRole('button', { name: 'Accounts' }))

    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Portal' })).not.toBeInTheDocument()
  })
})
