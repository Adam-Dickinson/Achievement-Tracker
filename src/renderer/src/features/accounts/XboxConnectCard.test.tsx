// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectResult, XboxConnectInput } from '@shared/ipc'
import { XboxConnectCard } from './XboxConnectCard'
import { fakeApi } from '@/test/fake-api'

const CONNECTED: ConnectResult = {
  ok: true,
  account: {
    id: 1,
    platform: 'xbox',
    displayName: 'SampleGamer',
    status: 'connected',
    gameCount: 0,
    checkedGames: 0,
    unlockedCount: 0,
    lastSyncAt: null,
    syncing: false,
  },
}
const CANCELLED: ConnectResult = {
  ok: false,
  reason: 'cancelled',
  message: 'The Microsoft sign-in was cancelled.',
}

const connectXbox = vi.fn<(input: XboxConnectInput) => Promise<ConnectResult>>()
const cancelXboxSignIn = vi.fn<() => Promise<void>>()
const onConnected = vi.fn()

beforeEach(() => {
  cancelXboxSignIn.mockResolvedValue(undefined)
  window.api = fakeApi({ connectXbox, cancelXboxSignIn })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function checkbox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /unofficial/ })
}

function signInButton(): HTMLElement {
  return screen.getByRole('button', { name: /Sign in with Microsoft|Signing in/ })
}

function accept() {
  fireEvent.click(checkbox())
}

function signIn() {
  fireEvent.click(signInButton())
}

function pending(): { resolve: (result: ConnectResult) => void } {
  let resolve: (result: ConnectResult) => void = () => undefined
  connectXbox.mockReturnValue(
    new Promise((settle) => {
      resolve = settle
    }),
  )
  return { resolve: (result) => resolve(result) }
}

describe('XboxConnectCard', () => {
  it('is a labelled section that says the connection is unofficial', () => {
    render(<XboxConnectCard onConnected={onConnected} />)

    expect(screen.getByRole('region', { name: 'Connect Xbox' })).toBeInTheDocument()
    expect(checkbox()).not.toBeChecked()
  })

  it('cannot start a sign-in until the unofficial connection is accepted', () => {
    render(<XboxConnectCard onConnected={onConnected} />)

    expect(signInButton()).toBeDisabled()
    signIn()
    expect(connectXbox).not.toHaveBeenCalled()

    accept()
    expect(signInButton()).toBeEnabled()
  })

  it('signs in with the acceptance, then clears the box and reports the connection', async () => {
    connectXbox.mockResolvedValue(CONNECTED)
    render(<XboxConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(connectXbox).toHaveBeenCalledWith({ acceptedUnofficial: true })
    expect(checkbox()).not.toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows that it is waiting for the browser, and locks the controls meanwhile', async () => {
    const signInResult = pending()
    render(<XboxConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Waiting for you to sign in in your browser…',
    )
    expect(signInButton()).toHaveTextContent('Signing in…')
    expect(signInButton()).toBeDisabled()
    expect(checkbox()).toBeDisabled()

    signInResult.resolve(CONNECTED)
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(signInButton()).toHaveTextContent('Sign in with Microsoft')
  })

  it('cancels a sign-in that is waiting, and shows why it stopped', async () => {
    const signInResult = pending()
    render(<XboxConnectCard onConnected={onConnected} />)

    accept()
    signIn()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(cancelXboxSignIn).toHaveBeenCalledOnce()
    signInResult.resolve(CANCELLED)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Microsoft sign-in was cancelled.',
    )
    expect(onConnected).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows the reason a sign-in failed, and keeps the box ticked to try again', async () => {
    connectXbox.mockResolvedValue({
      ok: false,
      reason: 'other',
      message: 'Xbox: this Microsoft account has no Xbox profile yet.',
    })
    render(<XboxConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('no Xbox profile yet')
    expect(checkbox()).toBeChecked()
    expect(signInButton()).toBeEnabled()
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('clears an old error when a new sign-in starts', async () => {
    connectXbox.mockResolvedValueOnce(CANCELLED)
    render(<XboxConnectCard onConnected={onConnected} />)

    accept()
    signIn()
    await screen.findByRole('alert')

    pending()
    signIn()

    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a general message if the call itself fails', async () => {
    connectXbox.mockRejectedValue(new Error('IPC broke'))
    render(<XboxConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })
})
