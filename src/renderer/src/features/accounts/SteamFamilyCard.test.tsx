// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectResult, SteamFamilyConnectInput } from '@shared/ipc'
import { SteamFamilyCard } from './SteamFamilyCard'
import { fakeApi } from '@/test/fake-api'

const CONNECTED: ConnectResult = {
  ok: true,
  account: {
    id: 1,
    platform: 'steam',
    displayName: 'TestPlayer',
    status: 'connected',
    gameCount: 0,
  },
}
const CANCELLED: ConnectResult = {
  ok: false,
  reason: 'cancelled',
  message: 'The Steam sign-in was cancelled.',
}

const connectSteamFamily = vi.fn<(input: SteamFamilyConnectInput) => Promise<ConnectResult>>()
const cancelSteamFamilySignIn = vi.fn<() => Promise<void>>()
const onConnected = vi.fn()

beforeEach(() => {
  cancelSteamFamilySignIn.mockResolvedValue(undefined)
  window.api = fakeApi({ connectSteamFamily, cancelSteamFamilySignIn })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function checkbox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /unofficial/ })
}

function signInButton(): HTMLElement {
  return screen.getByRole('button', { name: /Sign in with Steam|Signing in/ })
}

function accept() {
  fireEvent.click(checkbox())
}

function signIn() {
  fireEvent.click(signInButton())
}

function pending(): { resolve: (result: ConnectResult) => void } {
  let resolve: (result: ConnectResult) => void = () => undefined
  connectSteamFamily.mockReturnValue(
    new Promise((settle) => {
      resolve = settle
    }),
  )
  return { resolve: (result) => resolve(result) }
}

describe('SteamFamilyCard', () => {
  it('is a labelled section that says the connection is unofficial', () => {
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    expect(
      screen.getByRole('region', { name: 'Add your Steam family library' }),
    ).toBeInTheDocument()
    expect(checkbox()).not.toBeChecked()
  })

  it('cannot start a sign-in until the unofficial connection is accepted', () => {
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    expect(signInButton()).toBeDisabled()
    signIn()
    expect(connectSteamFamily).not.toHaveBeenCalled()

    accept()
    expect(signInButton()).toBeEnabled()
  })

  it('signs in with the acceptance, then clears the box and reports the connection', async () => {
    connectSteamFamily.mockResolvedValue(CONNECTED)
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    accept()
    signIn()

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(connectSteamFamily).toHaveBeenCalledWith({ acceptedUnofficial: true })
    expect(checkbox()).not.toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows that it is waiting for the Steam window, and locks the controls meanwhile', async () => {
    const signInResult = pending()
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Waiting for you to sign in in the Steam window…',
    )
    expect(signInButton()).toHaveTextContent('Signing in…')
    expect(signInButton()).toBeDisabled()
    expect(checkbox()).toBeDisabled()

    signInResult.resolve(CONNECTED)
    await vi.waitFor(() => expect(signInButton()).toHaveTextContent('Sign in with Steam'))
    expect(
      screen.queryByText('Waiting for you to sign in in the Steam window…'),
    ).not.toBeInTheDocument()
  })

  it('says the family library was added and its games are on their way', async () => {
    connectSteamFamily.mockResolvedValue(CONNECTED)
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByText(/^Family library added\./)).toHaveAttribute('role', 'status')
  })

  it('asks for the Steam account first, and cannot start until it is connected', () => {
    render(<SteamFamilyCard steamConnected={false} onConnected={onConnected} />)

    expect(screen.getByText('Connect your Steam account first.')).toBeInTheDocument()
    expect(checkbox()).toBeDisabled()
    expect(signInButton()).toBeDisabled()
  })

  it("warns that Steam's sign-in is kept and could act as the account", () => {
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    expect(screen.getByRole('region', { name: 'Add your Steam family library' })).toHaveTextContent(
      'can act as your account',
    )
  })

  it('cancels a sign-in that is waiting, and shows why it stopped', async () => {
    const signInResult = pending()
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    accept()
    signIn()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(cancelSteamFamilySignIn).toHaveBeenCalledOnce()
    signInResult.resolve(CANCELLED)
    expect(await screen.findByRole('alert')).toHaveTextContent('The Steam sign-in was cancelled.')
    expect(onConnected).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows the reason a sign-in failed, and keeps the box ticked to try again', async () => {
    connectSteamFamily.mockResolvedValue({
      ok: false,
      reason: 'other',
      message: 'Steam: store.steampowered.com refused the sign-in (HTTP 403)',
    })
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('refused the sign-in')
    expect(checkbox()).toBeChecked()
    expect(signInButton()).toBeEnabled()
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('clears an old error when a new sign-in starts', async () => {
    connectSteamFamily.mockResolvedValueOnce(CANCELLED)
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    accept()
    signIn()
    await screen.findByRole('alert')

    pending()
    signIn()

    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a general message if the call itself fails', async () => {
    connectSteamFamily.mockRejectedValue(new Error('IPC broke'))
    render(<SteamFamilyCard steamConnected onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })
})
