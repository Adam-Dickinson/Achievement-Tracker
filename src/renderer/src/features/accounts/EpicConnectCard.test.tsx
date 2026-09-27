// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectResult, EpicConnectInput } from '@shared/ipc'
import { EpicConnectCard } from './EpicConnectCard'
import { fakeApi } from '@/test/fake-api'

const CODE = '0123456789abcdef0123456789abcdef'
const CONNECTED: ConnectResult = {
  ok: true,
  account: {
    id: 1,
    platform: 'epic',
    displayName: 'EpicPlayer',
    status: 'connected',
    gameCount: 0,
    checkedGames: 0,
    lastSyncAt: null,
    syncing: false,
  },
}
const REJECTED: ConnectResult = {
  ok: false,
  reason: 'code_rejected',
  message: 'Epic did not accept that code. Codes only last a few minutes.',
}

const connectEpic = vi.fn<(input: EpicConnectInput) => Promise<ConnectResult>>()
const openEpicSignIn = vi.fn<() => Promise<void>>()
const onConnected = vi.fn()

beforeEach(() => {
  openEpicSignIn.mockResolvedValue(undefined)
  window.api = fakeApi({ connectEpic, openEpicSignIn })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function checkbox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /unofficial/ })
}

function codeBox(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Code from Epic' })
}

function openButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Open Epic sign-in' })
}

function connectButton(): HTMLElement {
  return screen.getByRole('button', { name: /Connect$|Connecting/ })
}

function paste(text: string) {
  fireEvent.change(codeBox(), { target: { value: text } })
}

function pending(): { resolve: (result: ConnectResult) => void } {
  let resolve: (result: ConnectResult) => void = () => undefined
  connectEpic.mockReturnValue(
    new Promise((settle) => {
      resolve = settle
    }),
  )
  return { resolve: (result) => resolve(result) }
}

describe('EpicConnectCard', () => {
  it('is a labelled form that says the connection is unofficial', () => {
    render(<EpicConnectCard onConnected={onConnected} />)

    expect(screen.getByRole('form', { name: 'Connect Epic Games' })).toBeInTheDocument()
    expect(checkbox()).not.toBeChecked()
    expect(codeBox()).toHaveValue('')
  })

  it('opens the Epic sign-in only after the unofficial connection is accepted', () => {
    render(<EpicConnectCard onConnected={onConnected} />)

    expect(openButton()).toBeDisabled()
    fireEvent.click(checkbox())
    fireEvent.click(openButton())

    expect(openEpicSignIn).toHaveBeenCalledOnce()
  })

  it('needs both the acceptance and some pasted text before it can connect', () => {
    render(<EpicConnectCard onConnected={onConnected} />)

    paste(CODE)
    expect(connectButton()).toBeDisabled()

    fireEvent.click(checkbox())
    paste('   ')
    expect(connectButton()).toBeDisabled()

    paste(CODE)
    expect(connectButton()).toBeEnabled()
  })

  it('connects with the pasted text, then clears the form and reports the connection', async () => {
    connectEpic.mockResolvedValue(CONNECTED)
    render(<EpicConnectCard onConnected={onConnected} />)

    fireEvent.click(checkbox())
    paste(CODE)
    fireEvent.click(connectButton())

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(connectEpic).toHaveBeenCalledWith({ code: CODE, acceptedUnofficial: true })
    expect(codeBox()).toHaveValue('')
    expect(checkbox()).not.toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('connects when Enter is pressed in the code box', async () => {
    connectEpic.mockResolvedValue(CONNECTED)
    render(<EpicConnectCard onConnected={onConnected} />)

    fireEvent.click(checkbox())
    paste(CODE)
    fireEvent.submit(codeBox())

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
  })

  it('says it is connecting and locks the form meanwhile', async () => {
    const connection = pending()
    render(<EpicConnectCard onConnected={onConnected} />)

    fireEvent.click(checkbox())
    paste(CODE)
    fireEvent.click(connectButton())

    expect(await screen.findByRole('button', { name: 'Connecting…' })).toBeDisabled()
    expect(codeBox()).toBeDisabled()
    expect(checkbox()).toBeDisabled()

    connection.resolve(CONNECTED)
    await vi.waitFor(() => expect(connectButton()).toHaveTextContent('Connect'))
  })

  it('shows why a code was refused and empties the box, since that code will not work again', async () => {
    connectEpic.mockResolvedValue(REJECTED)
    render(<EpicConnectCard onConnected={onConnected} />)

    fireEvent.click(checkbox())
    paste(CODE)
    fireEvent.click(connectButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Codes only last a few minutes')
    expect(codeBox()).toHaveValue('')
    expect(checkbox()).toBeChecked()
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('clears an old error when a new attempt starts', async () => {
    connectEpic.mockResolvedValueOnce(REJECTED)
    render(<EpicConnectCard onConnected={onConnected} />)

    fireEvent.click(checkbox())
    paste(CODE)
    fireEvent.click(connectButton())
    await screen.findByRole('alert')

    pending()
    paste(CODE)
    fireEvent.click(connectButton())

    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a general message if the call itself fails', async () => {
    connectEpic.mockRejectedValue(new Error('IPC broke'))
    render(<EpicConnectCard onConnected={onConnected} />)

    fireEvent.click(checkbox())
    paste(CODE)
    fireEvent.click(connectButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })
})
