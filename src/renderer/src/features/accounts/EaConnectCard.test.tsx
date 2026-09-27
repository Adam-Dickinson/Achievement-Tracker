// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectResult, EaConnectInput } from '@shared/ipc'
import { EaConnectCard } from './EaConnectCard'
import { fakeApi } from '@/test/fake-api'

const CONNECTED: ConnectResult = {
  ok: true,
  account: {
    id: 1,
    platform: 'ea',
    displayName: 'TestPlayer',
    status: 'connected',
    gameCount: 0,
    checkedGames: 0,
    lastSyncAt: null,
    syncing: false,
  },
}
const CANCELLED: ConnectResult = {
  ok: false,
  reason: 'cancelled',
  message: 'The EA sign-in was cancelled.',
}

const connectEa = vi.fn<(input: EaConnectInput) => Promise<ConnectResult>>()
const cancelEaSignIn = vi.fn<() => Promise<void>>()
const onConnected = vi.fn()

beforeEach(() => {
  cancelEaSignIn.mockResolvedValue(undefined)
  window.api = fakeApi({ connectEa, cancelEaSignIn })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function checkbox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /unofficial/ })
}

function signInButton(): HTMLElement {
  return screen.getByRole('button', { name: /Sign in with EA|Signing in/ })
}

function accept() {
  fireEvent.click(checkbox())
}

function signIn() {
  fireEvent.click(signInButton())
}

function pending(): { resolve: (result: ConnectResult) => void } {
  let resolve: (result: ConnectResult) => void = () => undefined
  connectEa.mockReturnValue(
    new Promise((settle) => {
      resolve = settle
    }),
  )
  return { resolve: (result) => resolve(result) }
}

describe('EaConnectCard', () => {
  it('is a labelled section that says the connection is unofficial', () => {
    render(<EaConnectCard onConnected={onConnected} />)

    expect(screen.getByRole('region', { name: 'Connect EA' })).toBeInTheDocument()
    expect(checkbox()).not.toBeChecked()
  })

  it('cannot start a sign-in until the unofficial connection is accepted', () => {
    render(<EaConnectCard onConnected={onConnected} />)

    expect(signInButton()).toBeDisabled()
    signIn()
    expect(connectEa).not.toHaveBeenCalled()

    accept()
    expect(signInButton()).toBeEnabled()
  })

  it('signs in with the acceptance, then clears the box and reports the connection', async () => {
    connectEa.mockResolvedValue(CONNECTED)
    render(<EaConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(connectEa).toHaveBeenCalledWith({ acceptedUnofficial: true })
    expect(checkbox()).not.toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows that it is waiting for the EA window, and locks the controls meanwhile', async () => {
    const signInResult = pending()
    render(<EaConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Waiting for you to sign in in the EA window…',
    )
    expect(signInButton()).toHaveTextContent('Signing in…')
    expect(signInButton()).toBeDisabled()
    expect(checkbox()).toBeDisabled()

    signInResult.resolve(CONNECTED)
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(signInButton()).toHaveTextContent('Sign in with EA')
  })

  it('cancels a sign-in that is waiting, and shows why it stopped', async () => {
    const signInResult = pending()
    render(<EaConnectCard onConnected={onConnected} />)

    accept()
    signIn()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(cancelEaSignIn).toHaveBeenCalledOnce()
    signInResult.resolve(CANCELLED)
    expect(await screen.findByRole('alert')).toHaveTextContent('The EA sign-in was cancelled.')
    expect(onConnected).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows the reason a sign-in failed, and keeps the box ticked to try again', async () => {
    connectEa.mockResolvedValue({
      ok: false,
      reason: 'other',
      message: 'EA: unexpected reply from the sign-in (HTTP 400)',
    })
    render(<EaConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected reply from the sign-in')
    expect(checkbox()).toBeChecked()
    expect(signInButton()).toBeEnabled()
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('clears an old error when a new sign-in starts', async () => {
    connectEa.mockResolvedValueOnce(CANCELLED)
    render(<EaConnectCard onConnected={onConnected} />)

    accept()
    signIn()
    await screen.findByRole('alert')

    pending()
    signIn()

    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a general message if the call itself fails', async () => {
    connectEa.mockRejectedValue(new Error('IPC broke'))
    render(<EaConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })
})
