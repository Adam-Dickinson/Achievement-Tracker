// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstalledEntry } from '@shared/launch'
import { fakeApi } from '@/test/fake-api'
import { PlayButtons } from './PlayButtons'

const STEAM: InstalledEntry = { gameId: 3, platformGameId: 7, platform: 'steam' }
const EPIC: InstalledEntry = { gameId: 3, platformGameId: 8, platform: 'epic' }

beforeEach(() => {
  window.api = fakeApi()
})
afterEach(cleanup)

function renderButtons(installed: InstalledEntry[] | null, entryIds = [7, 8]) {
  return render(<PlayButtons installed={installed} entryIds={entryIds} />)
}

describe('PlayButtons', () => {
  it('shows nothing before the first scan result', () => {
    renderButtons(null)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing when none of this game is installed', () => {
    renderButtons([{ gameId: 9, platformGameId: 99, platform: 'steam' }])

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a single Play button and starts the game', async () => {
    renderButtons([STEAM])

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    await waitFor(() => expect(window.api.playGame).toHaveBeenCalledWith(7))
  })

  it('shows one button per install when there are several', () => {
    renderButtons([STEAM, EPIC])

    expect(screen.getByRole('button', { name: 'Play on Steam' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play on Epic Games' })).toBeInTheDocument()
  })

  it('shows the reason when a game could not be started', async () => {
    window.api = fakeApi({
      playGame: vi.fn().mockResolvedValue({ ok: false, reason: 'Could not open the launcher.' }),
    })
    renderButtons([STEAM])

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open the launcher.')
  })

  it('shows a generic message when the call itself fails', async () => {
    window.api = fakeApi({ playGame: vi.fn().mockRejectedValue(new Error('ipc')) })
    renderButtons([STEAM])

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('disables the button while a start is in flight', async () => {
    window.api = fakeApi({ playGame: vi.fn().mockReturnValue(new Promise(() => {})) })
    renderButtons([STEAM])

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(await screen.findByRole('button', { name: 'Starting…' })).toBeDisabled()
  })
})
