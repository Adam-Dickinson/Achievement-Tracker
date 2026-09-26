// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ArtworkKeyResult,
  ArtworkRun,
  ArtworkSettings,
  SteamGridDbKeyInput,
} from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { ArtworkCard, runSummary } from './ArtworkCard'

const NO_KEY: ArtworkSettings = { hasKey: false, missing: 3, problem: null }
const WITH_KEY: ArtworkSettings = { hasKey: true, missing: 1, problem: null }
const KEY = '0123456789abcdef0123456789abcdef'

const getArtworkSettings = vi.fn<() => Promise<ArtworkSettings>>()
const saveSteamGridDbKey = vi.fn<(input: SteamGridDbKeyInput) => Promise<ArtworkKeyResult>>()
const removeSteamGridDbKey = vi.fn<() => Promise<void>>()
const findMissingArtwork = vi.fn<() => Promise<ArtworkRun>>()
let dataChanged: () => void = () => {}

beforeEach(() => {
  removeSteamGridDbKey.mockResolvedValue(undefined)
  window.api = fakeApi({
    getArtworkSettings,
    saveSteamGridDbKey,
    removeSteamGridDbKey,
    findMissingArtwork,
    onDataChanged: (listener) => {
      dataChanged = listener
      return () => {}
    },
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function keyBox(): HTMLElement {
  return screen.getByLabelText('SteamGridDB API key')
}

describe('runSummary', () => {
  it('says how many games got artwork', () => {
    expect(runSummary({ found: 2, checked: 3 })).toBe('Found artwork for 2 of 3 games.')
    expect(runSummary({ found: 0, checked: 1 })).toBe('Found artwork for 0 of 1 game.')
    expect(runSummary({ found: 0, checked: 0 })).toBe('No games need looking up right now.')
  })
})

describe('ArtworkCard', () => {
  it('explains SteamGridDB and says there is no key yet', async () => {
    getArtworkSettings.mockResolvedValue(NO_KEY)
    render(<ArtworkCard />)

    const card = screen.getByRole('region', { name: 'Artwork' })
    expect(card).toHaveTextContent('SteamGridDB')
    expect(
      await screen.findByText(/No SteamGridDB key saved\. 3 games have no artwork yet\./),
    ).toBeInTheDocument()
    expect(keyBox()).toHaveAttribute('type', 'password')
    expect(
      screen.queryByRole('button', { name: 'Find missing artwork now' }),
    ).not.toBeInTheDocument()
  })

  it('saves a key, clears the box and says it is looking for artwork', async () => {
    getArtworkSettings.mockResolvedValueOnce(NO_KEY).mockResolvedValue(WITH_KEY)
    saveSteamGridDbKey.mockResolvedValue({ ok: true })
    render(<ArtworkCard />)
    await screen.findByText(/No SteamGridDB key saved/)

    expect(screen.getByRole('button', { name: 'Save key' })).toBeDisabled()
    fireEvent.change(keyBox(), { target: { value: KEY } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Key saved.')
    expect(saveSteamGridDbKey).toHaveBeenCalledWith({ key: KEY })
    expect(keyBox()).toHaveValue('')
    expect(
      await screen.findByText(/A SteamGridDB key is saved\. 1 game has no artwork yet\./),
    ).toBeInTheDocument()
  })

  it('shows why a key was refused and keeps what was typed', async () => {
    getArtworkSettings.mockResolvedValue(NO_KEY)
    saveSteamGridDbKey.mockResolvedValue({
      ok: false,
      reason: 'key_rejected',
      message: 'SteamGridDB refused that key. Check it and try again.',
    })
    render(<ArtworkCard />)
    await screen.findByText(/No SteamGridDB key saved/)

    fireEvent.change(keyBox(), { target: { value: KEY } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('SteamGridDB refused that key.')
    expect(keyBox()).toHaveValue(KEY)
  })

  it('finds missing artwork on demand and reports the result', async () => {
    getArtworkSettings.mockResolvedValue(WITH_KEY)
    findMissingArtwork.mockResolvedValue({ found: 2, checked: 3 })
    render(<ArtworkCard />)

    fireEvent.click(await screen.findByRole('button', { name: 'Find missing artwork now' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Found artwork for 2 of 3 games.')
  })

  it('removes the key', async () => {
    getArtworkSettings.mockResolvedValueOnce(WITH_KEY).mockResolvedValue(NO_KEY)
    render(<ArtworkCard />)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove key' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Key removed.')
    expect(removeSteamGridDbKey).toHaveBeenCalledOnce()
    expect(await screen.findByText(/No SteamGridDB key saved/)).toBeInTheDocument()
  })

  it('warns when the saved key was refused', async () => {
    getArtworkSettings.mockResolvedValue({ ...WITH_KEY, problem: 'key_refused' })
    render(<ArtworkCard />)

    expect(await screen.findByRole('alert')).toHaveTextContent('refused the saved key')
  })

  it('reloads when the main process says the data changed', async () => {
    getArtworkSettings
      .mockResolvedValueOnce(WITH_KEY)
      .mockResolvedValue({ ...WITH_KEY, missing: 0 })
    render(<ArtworkCard />)
    await screen.findByText(/1 game has no artwork yet/)

    act(() => dataChanged())

    expect(await screen.findByText(/Every game has artwork\./)).toBeInTheDocument()
  })

  it('shows a general message if a call fails', async () => {
    getArtworkSettings.mockResolvedValue(WITH_KEY)
    findMissingArtwork.mockRejectedValue(new Error('IPC broke'))
    render(<ArtworkCard />)

    fireEvent.click(await screen.findByRole('button', { name: 'Find missing artwork now' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })
})
