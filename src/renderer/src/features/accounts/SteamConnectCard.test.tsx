// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectResult, SteamSignInInput } from '@shared/ipc'
import { SteamConnectCard } from './SteamConnectCard'
import { fakeApi } from '@/test/fake-api'

const CONNECTED: ConnectResult = {
  ok: true,
  account: { id: 1, platform: 'steam', displayName: 'Tester', status: 'connected', gameCount: 0 },
}
const CANCELLED: ConnectResult = {
  ok: false,
  reason: 'cancelled',
  message: 'The Steam sign-in was cancelled.',
}

const signInToSteam = vi.fn<(input: SteamSignInInput) => Promise<ConnectResult>>()
const cancelSteamSignIn = vi.fn<() => Promise<void>>()
const onConnected = vi.fn()

beforeEach(() => {
  cancelSteamSignIn.mockResolvedValue(undefined)
  window.api = fakeApi({ signInToSteam, cancelSteamSignIn })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function card(): HTMLElement {
  return screen.getByRole('region', { name: 'Connect Steam' })
}

function optIn(): HTMLElement {
  return screen.getByRole('checkbox', { name: /unofficial/ })
}

function familyBox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /family library/ })
}

function signInButton(): HTMLElement {
  return screen.getByRole('button', { name: /Sign in with Steam|Signing in/ })
}

function pending(): { resolve: (result: ConnectResult) => void } {
  let resolve: (result: ConnectResult) => void = () => undefined
  signInToSteam.mockReturnValue(
    new Promise((settle) => {
      resolve = settle
    }),
  )
  return { resolve: (result) => resolve(result) }
}

describe('SteamConnectCard', () => {
  it('offers the family library ticked, and warns that it keeps a sign-in that can act as the account', () => {
    render(<SteamConnectCard onConnected={onConnected} />)

    expect(card()).toBeInTheDocument()
    expect(familyBox()).toBeChecked()
    expect(familyBox().closest('label')).toHaveTextContent('can act as your account')
    expect(optIn()).not.toBeChecked()
  })

  it('cannot start a sign-in until the unofficial connection is accepted', () => {
    render(<SteamConnectCard onConnected={onConnected} />)

    expect(signInButton()).toBeDisabled()
    fireEvent.click(optIn())
    expect(signInButton()).toBeEnabled()
  })

  it.each([true, false])(
    'signs in with the family library %s, then clears the opt-in and reports the connection',
    async (includeFamily) => {
      signInToSteam.mockResolvedValue(CONNECTED)
      render(<SteamConnectCard onConnected={onConnected} />)

      if (!includeFamily) fireEvent.click(familyBox())
      fireEvent.click(optIn())
      fireEvent.click(signInButton())

      await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
      expect(signInToSteam).toHaveBeenCalledWith({ includeFamily, acceptedUnofficial: true })
      expect(optIn()).not.toBeChecked()
    },
  )

  it('waits for the Steam window with the controls locked, and can cancel it', async () => {
    const signIn = pending()
    render(<SteamConnectCard onConnected={onConnected} />)

    fireEvent.click(optIn())
    fireEvent.click(signInButton())

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Waiting for you to sign in in the Steam window…',
    )
    expect(signInButton()).toBeDisabled()
    expect(familyBox()).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancelSteamSignIn).toHaveBeenCalledOnce()

    signIn.resolve(CANCELLED)
    expect(await screen.findByRole('alert')).toHaveTextContent('The Steam sign-in was cancelled.')
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('shows why a sign-in failed, such as an account without an API key', async () => {
    signInToSteam.mockResolvedValue({
      ok: false,
      reason: 'other',
      message: 'Your Steam account has no Web API key yet.',
    })
    render(<SteamConnectCard onConnected={onConnected} />)

    fireEvent.click(optIn())
    fireEvent.click(signInButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('no Web API key')
    expect(optIn()).toBeChecked()
  })

  it('shows a general message if the call itself fails', async () => {
    signInToSteam.mockRejectedValue(new Error('IPC broke'))
    render(<SteamConnectCard onConnected={onConnected} />)

    fireEvent.click(optIn())
    fireEvent.click(signInButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })

  it('keeps connecting with an API key as a fallback', () => {
    render(<SteamConnectCard onConnected={onConnected} />)

    expect(within(card()).getByText('Use an API key instead')).toBeInTheDocument()
    expect(
      within(card()).getByRole('form', { name: 'Connect with an API key' }),
    ).toBeInTheDocument()
  })
})
