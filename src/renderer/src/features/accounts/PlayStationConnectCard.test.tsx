// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectResult, PlayStationConnectInput } from '@shared/ipc'
import { PlayStationConnectCard } from './PlayStationConnectCard'
import { fakeApi } from '@/test/fake-api'

const CONNECTED: ConnectResult = {
  ok: true,
  account: {
    id: 1,
    platform: 'playstation',
    displayName: 'TestPlayer',
    status: 'connected',
    gameCount: 0,
  },
}
const CANCELLED: ConnectResult = {
  ok: false,
  reason: 'cancelled',
  message: 'The PlayStation sign-in was cancelled.',
}

const connectPlayStation = vi.fn<(input: PlayStationConnectInput) => Promise<ConnectResult>>()
const cancelPlayStationSignIn = vi.fn<() => Promise<void>>()
const onConnected = vi.fn()

beforeEach(() => {
  cancelPlayStationSignIn.mockResolvedValue(undefined)
  window.api = fakeApi({ connectPlayStation, cancelPlayStationSignIn })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function checkbox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /unofficial/ })
}

function signInButton(): HTMLElement {
  return screen.getByRole('button', { name: /Sign in with PlayStation|Signing in/ })
}

function accept() {
  fireEvent.click(checkbox())
}

function signIn() {
  fireEvent.click(signInButton())
}

function pending(): { resolve: (result: ConnectResult) => void } {
  let resolve: (result: ConnectResult) => void = () => undefined
  connectPlayStation.mockReturnValue(
    new Promise((settle) => {
      resolve = settle
    }),
  )
  return { resolve: (result) => resolve(result) }
}

describe('PlayStationConnectCard', () => {
  it('is a labelled section that says the connection is unofficial', () => {
    render(<PlayStationConnectCard onConnected={onConnected} />)

    expect(screen.getByRole('region', { name: 'Connect PlayStation' })).toBeInTheDocument()
    expect(checkbox()).not.toBeChecked()
  })

  it('says the password is never stored and the sign-in lasts about two months', () => {
    render(<PlayStationConnectCard onConnected={onConnected} />)

    const card = screen.getByRole('region', { name: 'Connect PlayStation' })
    expect(card).toHaveTextContent('never stores your password')
    expect(card).toHaveTextContent('about two months')
  })

  it('cannot start a sign-in until the unofficial connection is accepted', () => {
    render(<PlayStationConnectCard onConnected={onConnected} />)

    expect(signInButton()).toBeDisabled()
    signIn()
    expect(connectPlayStation).not.toHaveBeenCalled()

    accept()
    expect(signInButton()).toBeEnabled()
  })

  it('signs in with the acceptance, then clears the box and reports the connection', async () => {
    connectPlayStation.mockResolvedValue(CONNECTED)
    render(<PlayStationConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(connectPlayStation).toHaveBeenCalledWith({ acceptedUnofficial: true })
    expect(checkbox()).not.toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows that it is waiting for the PlayStation window, and locks the controls meanwhile', async () => {
    const signInResult = pending()
    render(<PlayStationConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Waiting for you to sign in in the PlayStation window…',
    )
    expect(signInButton()).toHaveTextContent('Signing in…')
    expect(signInButton()).toBeDisabled()
    expect(checkbox()).toBeDisabled()

    signInResult.resolve(CONNECTED)
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(signInButton()).toHaveTextContent('Sign in with PlayStation')
  })

  it('cancels a sign-in that is waiting, and shows why it stopped', async () => {
    const signInResult = pending()
    render(<PlayStationConnectCard onConnected={onConnected} />)

    accept()
    signIn()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(cancelPlayStationSignIn).toHaveBeenCalledOnce()
    signInResult.resolve(CANCELLED)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The PlayStation sign-in was cancelled.',
    )
    expect(onConnected).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows the reason a sign-in failed, and keeps the box ticked to try again', async () => {
    connectPlayStation.mockResolvedValue({
      ok: false,
      reason: 'other',
      message: 'PlayStation: unexpected reply from the sign-in (HTTP 400)',
    })
    render(<PlayStationConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected reply from the sign-in')
    expect(checkbox()).toBeChecked()
    expect(signInButton()).toBeEnabled()
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('clears an old error when a new sign-in starts', async () => {
    connectPlayStation.mockResolvedValueOnce(CANCELLED)
    render(<PlayStationConnectCard onConnected={onConnected} />)

    accept()
    signIn()
    await screen.findByRole('alert')

    pending()
    signIn()

    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a general message if the call itself fails', async () => {
    connectPlayStation.mockRejectedValue(new Error('IPC broke'))
    render(<PlayStationConnectCard onConnected={onConnected} />)

    accept()
    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })
})
