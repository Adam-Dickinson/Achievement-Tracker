// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChooseEmulatorFolderResult,
  ConnectResult,
  EmulatorConnectInput,
  EmulatorFolder,
} from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { Rpcs3Card } from './Rpcs3Card'

const FOLDER: EmulatorFolder = {
  path: 'D:\\Emulators\\rpcs3',
  users: [{ id: '00000001', name: 'User', games: 1, unlocked: 0 }],
}

const CONNECTED: ConnectResult = {
  ok: true,
  account: {
    id: 1,
    platform: 'rpcs3',
    displayName: 'User',
    status: 'connected',
    gameCount: 1,
    checkedGames: 1,
    unlockedCount: 0,
    lastSyncAt: null,
    syncing: false,
  },
}

const findRpcs3 = vi.fn<() => Promise<EmulatorFolder | null>>()
const chooseRpcs3Folder = vi.fn<() => Promise<ChooseEmulatorFolderResult>>()
const connectRpcs3 = vi.fn<(input: EmulatorConnectInput) => Promise<ConnectResult>>()
const connectShadPs4 = vi.fn<(input: EmulatorConnectInput) => Promise<ConnectResult>>()
const onConnected = vi.fn()

beforeEach(() => {
  window.api = fakeApi({ findRpcs3, chooseRpcs3Folder, connectRpcs3, connectShadPs4 })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function renderCard(connectedNames: readonly string[] = []) {
  return render(<Rpcs3Card connectedNames={connectedNames} onConnected={onConnected} />)
}

describe('Rpcs3Card', () => {
  it('names itself RPCS3 and offers a folder chooser when it finds nothing', async () => {
    findRpcs3.mockResolvedValue(null)
    renderCard()

    expect(screen.getByRole('region', { name: 'RPCS3, not connected' })).toBeInTheDocument()
    expect(screen.getByText('Looking for RPCS3…')).toBeInTheDocument()
    expect(await screen.findByText('No RPCS3 data found automatically.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeInTheDocument()
  })

  it('lists the users of a found folder with their trophies', async () => {
    findRpcs3.mockResolvedValue(FOLDER)
    renderCard()

    expect(await screen.findByText(FOLDER.path)).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'RPCS3 user' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /User/ })).toBeChecked()
    expect(screen.getByText('0 unlocked in 1 game')).toBeInTheDocument()
  })

  it("connects the selected user through the RPCS3 calls, not shadPS4's", async () => {
    findRpcs3.mockResolvedValue(FOLDER)
    connectRpcs3.mockResolvedValue(CONNECTED)
    renderCard()
    await screen.findByText(FOLDER.path)

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(connectRpcs3).toHaveBeenCalledWith({ path: FOLDER.path, userId: '00000001' })
    expect(connectShadPs4).not.toHaveBeenCalled()
  })

  it('shows why connecting failed', async () => {
    findRpcs3.mockResolvedValue(FOLDER)
    connectRpcs3.mockResolvedValue({
      ok: false,
      reason: 'other',
      message: 'RPCS3: no RPCS3 data in that folder',
    })
    renderCard()
    await screen.findByText(FOLDER.path)

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('no RPCS3 data in that folder')
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('uses a chosen folder', async () => {
    findRpcs3.mockResolvedValue(null)
    chooseRpcs3Folder.mockResolvedValue({ kind: 'chosen', folder: FOLDER })
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }))

    expect(await screen.findByText(FOLDER.path)).toBeInTheDocument()
  })

  it('reports a chosen folder with no RPCS3 data in it', async () => {
    findRpcs3.mockResolvedValue(null)
    chooseRpcs3Folder.mockResolvedValue({ kind: 'not_found', path: 'C:\\Nothing' })
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No RPCS3 data found in C:\\Nothing.',
    )
  })

  it('says when every user is already connected', async () => {
    findRpcs3.mockResolvedValue(FOLDER)
    renderCard(['User'])

    expect(
      await screen.findByText('Every RPCS3 user here is already connected.'),
    ).toBeInTheDocument()
  })
})
