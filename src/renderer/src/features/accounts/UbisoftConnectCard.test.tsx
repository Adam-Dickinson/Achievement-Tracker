// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectResult, UbisoftConnectInput } from '@shared/ipc'
import { UbisoftConnectCard } from './UbisoftConnectCard'
import { fakeApi } from '@/test/fake-api'

const CONNECTED: ConnectResult = {
  ok: true,
  account: {
    id: 1,
    platform: 'ubisoft',
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
  message: 'The Ubisoft sign-in was cancelled.',
}

const connectUbisoft = vi.fn<(input: UbisoftConnectInput) => Promise<ConnectResult>>()
const cancelUbisoftSignIn = vi.fn<() => Promise<void>>()
const onConnected = vi.fn()

beforeEach(() => {
  cancelUbisoftSignIn.mockResolvedValue(undefined)
  window.api = fakeApi({ connectUbisoft, cancelUbisoftSignIn })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function checkbox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /unofficial/ })
}

function signInButton(): HTMLElement {
  return screen.getByRole('button', { name: /Sign in with Ubisoft|Signing in/ })
}

function accept() {
  fireEvent.click(checkbox())
}

function signIn() {
  fireEvent.click(signInButton())
}

function pending(): { resolve: (result: ConnectResult) => void } {
  let resolve: (result: ConnectResult) => void = () => undefined
  connectUbisoft.mockReturnValue(
    new Promise((settle) => {
      resolve = settle
    }),
  )
  return { resolve: (result) => resolve(result) }
}

describe('UbisoftConnectCard', () => {
  it('is a labelled section that says the connection is unofficial', () => {
    render(<UbisoftConnectCard onConnected={onConnected} />)

    expect(screen.getByRole('region', { name: 'Connect Ubisoft' })).toBeInTheDocument()
    expect(checkbox()).not.toBeChecked()
  })

  it('cannot start a sign-in until the unofficial connection is accepted', () => {
    render(<UbisoftConnectCard onConnected={onConnected} />)

    expect(signInButton()).toBeDisabled()
    signIn()
    expect(connectUbisoft).not.toHaveBeenCalled()

    accept()
    expect(signInButton()).toBeEnabled()
  })

  it('signs in with the acceptance, then clears the box and reports the connection', async () => {
    connectUbisoft.mockResolvedValue(CONNECTED)
    render(<UbisoftConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(connectUbisoft).toHaveBeenCalledWith({ acceptedUnofficial: true })
    expect(checkbox()).not.toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows that it is waiting for the Ubisoft window, and locks the controls meanwhile', async () => {
    const signInResult = pending()
    render(<UbisoftConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Waiting for you to sign in in the Ubisoft window…',
    )
    expect(signInButton()).toHaveTextContent('Signing in…')
    expect(signInButton()).toBeDisabled()
    expect(checkbox()).toBeDisabled()

    signInResult.resolve(CONNECTED)
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(signInButton()).toHaveTextContent('Sign in with Ubisoft')
  })

  it('cancels a sign-in that is waiting, and shows why it stopped', async () => {
    const signInResult = pending()
    render(<UbisoftConnectCard onConnected={onConnected} />)

    accept()
    signIn()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(cancelUbisoftSignIn).toHaveBeenCalledOnce()
    signInResult.resolve(CANCELLED)
    expect(await screen.findByRole('alert')).toHaveTextContent('The Ubisoft sign-in was cancelled.')
    expect(onConnected).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows the reason a sign-in failed, and keeps the box ticked to try again', async () => {
    connectUbisoft.mockResolvedValue({
      ok: false,
      reason: 'other',
      message: 'Ubisoft: unexpected reply from the sign-in (HTTP 400)',
    })
    render(<UbisoftConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected reply from the sign-in')
    expect(checkbox()).toBeChecked()
    expect(signInButton()).toBeEnabled()
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('clears an old error when a new sign-in starts', async () => {
    connectUbisoft.mockResolvedValueOnce(CANCELLED)
    render(<UbisoftConnectCard onConnected={onConnected} />)

    accept()
    signIn()
    await screen.findByRole('alert')

    pending()
    signIn()

    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a general message if the call itself fails', async () => {
    connectUbisoft.mockRejectedValue(new Error('IPC broke'))
    render(<UbisoftConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })
})
