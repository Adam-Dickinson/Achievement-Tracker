// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { fakeApi } from '@/test/fake-api'

const sendTestNotification = vi.fn()

beforeEach(() => {
  window.api = fakeApi({
    sendTestNotification,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('App', () => {
  it('starts on the dashboard and switches page when a nav item is clicked', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Library' }))

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('v0.1.0 · schema 1')).toBeInTheDocument()
  })

  it('shows the Accounts screen on the Accounts page', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Accounts' }))

    expect(await screen.findByText('No accounts connected yet.')).toBeInTheDocument()
    expect(window.api.listAccounts).toHaveBeenCalledOnce()
  })

  it('shows the Activity timeline on the Activity page', async () => {
    window.api = fakeApi({
      listActivity: vi.fn().mockResolvedValue({ unlocks: [], hasMore: false }),
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))

    expect(await screen.findByText(/Nothing unlocked yet/)).toBeInTheDocument()
    expect(window.api.listActivity).toHaveBeenCalledOnce()
  })

  it('asks the main process for a test notification', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Send test notification' }))

    expect(sendTestNotification).toHaveBeenCalledOnce()
    await screen.findByText('v0.1.0 · schema 1')
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
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))

    fireEvent.click(await screen.findByRole('button', { name: /Portal/ }))
    expect(await screen.findByRole('heading', { name: 'Portal' })).toBeInTheDocument()
    expect(window.api.getGame).toHaveBeenCalledWith(7)

    fireEvent.click(screen.getByRole('button', { name: 'Library', current: false }))
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument()
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
        },
        {
          platformGameId: 71,
          platform: 'xbox',
          tag: null,
          title: 'Portal',
          unlocked: 0,
          total: 2,
          achievements: [],
        },
      ],
    })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))

    fireEvent.click(await screen.findByRole('button', { name: /Test Subject/ }))

    expect(await screen.findByRole('tab', { name: /Xbox/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('leaves a game when another page is picked in the nav', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(await screen.findByRole('button', { name: /Portal/ }))
    await screen.findByRole('heading', { name: 'Portal' })

    fireEvent.click(screen.getByRole('button', { name: 'Accounts' }))

    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Portal' })).not.toBeInTheDocument()
  })
})
