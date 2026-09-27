// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectResult, SteamConnectInput } from '@shared/ipc'
import { SteamConnectForm } from './SteamConnectForm'
import { fakeApi } from '@/test/fake-api'

const STEAM_ID = '76561190000000001'
const KEY = '0123456789ABCDEF0123456789ABCDEF'
const CONNECTED: ConnectResult = {
  ok: true,
  account: {
    id: 1,
    platform: 'steam',
    displayName: 'Player',
    status: 'connected',
    gameCount: 0,
    checkedGames: 0,
    lastSyncAt: null,
    syncing: false,
  },
}

const connectSteam = vi.fn<(input: SteamConnectInput) => Promise<ConnectResult>>()
const onConnected = vi.fn()

beforeEach(() => {
  window.api = fakeApi({
    connectSteam,
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function fillIn(steamId = STEAM_ID, apiKey = KEY) {
  fireEvent.change(screen.getByLabelText('SteamID64'), { target: { value: steamId } })
  fireEvent.change(screen.getByLabelText('Steam API key'), { target: { value: apiKey } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
}

describe('SteamConnectForm', () => {
  it('is a labelled form with a hidden key field', () => {
    render(<SteamConnectForm onConnected={onConnected} />)

    expect(screen.getByRole('form', { name: 'Connect with an API key' })).toBeInTheDocument()
    expect(screen.getByLabelText('Steam API key')).toHaveAttribute('type', 'password')
  })

  it('sends what was typed, then clears the fields and reports the connection', async () => {
    connectSteam.mockResolvedValue(CONNECTED)
    render(<SteamConnectForm onConnected={onConnected} />)

    fillIn()
    submit()

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(connectSteam).toHaveBeenCalledWith({ steamId: STEAM_ID, apiKey: KEY })
    expect(screen.getByLabelText('SteamID64')).toHaveValue('')
    expect(screen.getByLabelText('Steam API key')).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows "Connecting…" and blocks a second submit while waiting', () => {
    connectSteam.mockReturnValue(new Promise(() => {}))
    render(<SteamConnectForm onConnected={onConnected} />)

    fillIn()
    submit()

    const button = screen.getByRole('button', { name: 'Connecting…' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(connectSteam).toHaveBeenCalledOnce()
  })

  it('shows the reason a connection failed and keeps what was typed', async () => {
    connectSteam.mockResolvedValue({
      ok: false,
      reason: 'key_rejected',
      message: 'Steam rejected that API key. Check it and try again.',
    })
    render(<SteamConnectForm onConnected={onConnected} />)

    fillIn()
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Steam rejected that API key')
    expect(onConnected).not.toHaveBeenCalled()
    expect(screen.getByLabelText('SteamID64')).toHaveValue(STEAM_ID)
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled()
  })

  it('recovers if the request itself fails', async () => {
    connectSteam.mockRejectedValue(new Error('IPC broke'))
    render(<SteamConnectForm onConnected={onConnected} />)

    fillIn()
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled()
  })

  it('clears an old error when trying again', async () => {
    connectSteam.mockResolvedValueOnce({ ok: false, reason: 'network', message: 'Offline' })
    connectSteam.mockReturnValueOnce(new Promise(() => {}))
    render(<SteamConnectForm onConnected={onConnected} />)

    fillIn()
    submit()
    await screen.findByRole('alert')
    submit()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not send anything while a field is empty', () => {
    render(<SteamConnectForm onConnected={onConnected} />)

    fillIn(STEAM_ID, '')
    submit()

    expect(connectSteam).not.toHaveBeenCalled()
  })
})
