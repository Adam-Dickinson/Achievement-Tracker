// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSummary, ConnectResult, SteamConnectInput } from '@shared/ipc'
import { Onboarding } from './Onboarding'
import { fakeApi } from '@/test/fake-api'

const connectSteam = vi.fn<(input: SteamConnectInput) => Promise<ConnectResult>>()
const onDone = vi.fn()

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

beforeEach(() => {
  window.api = fakeApi({ connectSteam })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function connectSteamInForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Connect Steam' }))
  fireEvent.change(screen.getByLabelText('SteamID64'), { target: { value: '76561190000000001' } })
  fireEvent.change(screen.getByLabelText('Steam API key'), { target: { value: 'KEY' } })
  fireEvent.click(
    within(screen.getByRole('form', { name: 'Connect with an API key' })).getByRole('button', {
      name: 'Connect',
    }),
  )
}

describe('Onboarding', () => {
  it('starts on Welcome, and Skip setup finishes onboarding from there', () => {
    render(<Onboarding onDone={onDone} />)

    expect(screen.getByRole('heading', { name: 'Welcome to Trophy Locker' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))

    expect(onDone).toHaveBeenCalledOnce()
  })

  it('moves from Welcome to Platforms, where Continue starts disabled', () => {
    render(<Onboarding onDone={onDone} />)

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    expect(screen.getByRole('heading', { name: 'Connect your platforms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Connect Steam' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'shadPS4, not connected' })).toBeInTheDocument()
  })

  it('goes back from Platforms to Welcome', () => {
    render(<Onboarding onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByRole('heading', { name: 'Welcome to Trophy Locker' })).toBeInTheDocument()
  })

  it('connecting a platform swaps its tile to Connected and enables Continue', async () => {
    connectSteam.mockResolvedValue({ ok: true, account: STEAM_ACCOUNT })
    render(<Onboarding onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    connectSteamInForm()

    expect(await screen.findByRole('region', { name: 'Steam, connected' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Steam' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('goes from Platforms to Done, reporting how many platforms connected, then finishes', async () => {
    connectSteam.mockResolvedValue({ ok: true, account: STEAM_ACCOUNT })
    render(<Onboarding onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    connectSteamInForm()
    await screen.findByRole('region', { name: 'Steam, connected' })

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: "You're set up" })).toBeInTheDocument()
    expect(screen.getByText(/1 platform connected/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Go to Dashboard' }))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('Skip setup finishes onboarding from the Platforms step too', () => {
    render(<Onboarding onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))

    expect(onDone).toHaveBeenCalledOnce()
  })
})
