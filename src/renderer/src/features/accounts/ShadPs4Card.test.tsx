// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChooseEmulatorFolderResult,
  ConnectResult,
  EmulatorConnectInput,
  EmulatorFolder,
} from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { ShadPs4Card } from './ShadPs4Card'

const FOLDER: EmulatorFolder = {
  path: 'C:\\Users\\player\\AppData\\Roaming\\shadPS4',
  users: [
    { id: '1000', name: 'Player 1', games: 1, unlocked: 10 },
    { id: '1001', name: 'Player 2', games: 1, unlocked: 0 },
  ],
}

const CONNECTED: ConnectResult = {
  ok: true,
  account: {
    id: 1,
    platform: 'shadps4',
    displayName: 'Player 1',
    status: 'connected',
    gameCount: 1,
    checkedGames: 1,
    unlockedCount: 10,
    lastSyncAt: null,
    syncing: false,
  },
}

const findShadPs4 = vi.fn<() => Promise<EmulatorFolder | null>>()
const chooseShadPs4Folder = vi.fn<() => Promise<ChooseEmulatorFolderResult>>()
const connectShadPs4 = vi.fn<(input: EmulatorConnectInput) => Promise<ConnectResult>>()
const onConnected = vi.fn()

beforeEach(() => {
  window.api = fakeApi({ findShadPs4, chooseShadPs4Folder, connectShadPs4 })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function renderCard(connectedNames: readonly string[] = [], reconnectName?: string | null) {
  return render(
    <ShadPs4Card
      connectedNames={connectedNames}
      onConnected={onConnected}
      reconnectName={reconnectName}
    />,
  )
}

describe('ShadPs4Card', () => {
  it('looks for shadPS4 automatically and offers a folder chooser when it finds nothing', async () => {
    findShadPs4.mockResolvedValue(null)
    renderCard()

    expect(screen.getByText('Looking for shadPS4…')).toBeInTheDocument()
    expect(await screen.findByText('No shadPS4 data found automatically.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeInTheDocument()
  })

  it('lists every user of a folder it finds, with their progress', async () => {
    findShadPs4.mockResolvedValue(FOLDER)
    renderCard()

    expect(await screen.findByText(FOLDER.path)).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'shadPS4 user' })
    expect(within(group).getByText('Player 1')).toBeInTheDocument()
    expect(within(group).getByText('10 unlocked in 1 game')).toBeInTheDocument()
    expect(within(group).getByText('Player 2')).toBeInTheDocument()
    expect(within(group).getByText('0 unlocked in 1 game')).toBeInTheDocument()
  })

  it('preselects the first user not already connected', async () => {
    findShadPs4.mockResolvedValue(FOLDER)
    renderCard(['Player 1'])

    const radios = await screen.findAllByRole('radio')
    expect(screen.getByRole('radio', { name: /Player 2/ })).toBeChecked()
    expect(radios).toHaveLength(1)
  })

  it('says so when every user of the found folder is already connected', async () => {
    findShadPs4.mockResolvedValue({ ...FOLDER, users: [FOLDER.users[0]!] })
    renderCard(['Player 1'])

    expect(
      await screen.findByText('Every shadPS4 user here is already connected.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument()
  })

  it('connects the selected user with the folder path', async () => {
    findShadPs4.mockResolvedValue(FOLDER)
    connectShadPs4.mockResolvedValue(CONNECTED)
    renderCard()
    await screen.findByText(FOLDER.path)

    fireEvent.click(screen.getByRole('radio', { name: /Player 2/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce())
    expect(connectShadPs4).toHaveBeenCalledWith({ path: FOLDER.path, userId: '1001' })
  })

  it('shows why connecting failed, without reporting success', async () => {
    findShadPs4.mockResolvedValue(FOLDER)
    connectShadPs4.mockResolvedValue({
      ok: false,
      reason: 'other',
      message: 'shadPS4: no shadPS4 data in that folder',
    })
    renderCard()
    await screen.findByText(FOLDER.path)

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('no shadPS4 data in that folder')
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('opens the folder chooser and shows its found users', async () => {
    findShadPs4.mockResolvedValue(null)
    chooseShadPs4Folder.mockResolvedValue({ kind: 'chosen', folder: FOLDER })
    renderCard()
    await screen.findByRole('button', { name: 'Choose folder…' })

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))

    expect(await screen.findByText(FOLDER.path)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Player 1/ })).toBeChecked()
  })

  it('reports a chosen folder with no shadPS4 data in it', async () => {
    findShadPs4.mockResolvedValue(null)
    chooseShadPs4Folder.mockResolvedValue({ kind: 'not_found', path: 'C:\\Nothing' })
    renderCard()
    await screen.findByRole('button', { name: 'Choose folder…' })

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No shadPS4 data found in C:\\Nothing.',
    )
  })

  it('preselects and focuses the named user for a reconnect', async () => {
    findShadPs4.mockResolvedValue(FOLDER)
    renderCard([], 'Player 2')

    const radio = await screen.findByRole('radio', { name: /Player 2/ })
    await vi.waitFor(() => expect(radio).toBeChecked())
    expect(radio).toHaveFocus()
  })

  it('does nothing when the folder chooser is cancelled', async () => {
    findShadPs4.mockResolvedValue(null)
    chooseShadPs4Folder.mockResolvedValue({ kind: 'cancelled' })
    renderCard()
    await screen.findByRole('button', { name: 'Choose folder…' })

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))

    await vi.waitFor(() => expect(chooseShadPs4Folder).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeInTheDocument()
  })
})
