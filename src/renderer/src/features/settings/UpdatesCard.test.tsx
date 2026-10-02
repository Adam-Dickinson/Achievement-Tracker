// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/updates'
import { fakeApi } from '@/test/fake-api'
import { UpdatesCard } from './UpdatesCard'

const BASE: UpdateState = {
  status: 'idle',
  currentVersion: '1.0.0',
  version: null,
  percent: null,
  message: null,
  lastCheckedAt: null,
  autoCheck: true,
  dismissed: false,
}

const getUpdateState = vi.fn<() => Promise<UpdateState>>()
const checkForUpdates = vi.fn<() => Promise<UpdateState>>()
const downloadUpdate = vi.fn<() => Promise<UpdateState>>()
const installUpdate = vi.fn<() => Promise<void>>()
const setAutoCheck = vi.fn<(on: boolean) => Promise<UpdateState>>()

beforeEach(() => {
  installUpdate.mockResolvedValue(undefined)
  window.api = fakeApi({
    getUpdateState,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    setAutoCheck,
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

async function showing(state: UpdateState) {
  getUpdateState.mockResolvedValue(state)
  render(<UpdatesCard />)
  await screen.findByText('Trophy Locker 1.0.0')
}

describe('UpdatesCard', () => {
  it('has a titled region and shows the current version', async () => {
    await showing(BASE)

    expect(screen.getByRole('region', { name: 'Updates' })).toBeInTheDocument()
  })

  it('says why checking is off when the app is not installed', async () => {
    await showing({ ...BASE, status: 'disabled' })

    expect(screen.getByText('Updates are available in the installed app.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check now' })).toBeDisabled()
  })

  it('checks on request and shows the answer', async () => {
    await showing(BASE)
    checkForUpdates.mockResolvedValue({ ...BASE, status: 'available', version: '1.1.0' })

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(await screen.findByText('Version 1.1.0 is available.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('says it is up to date after a check that found nothing', async () => {
    await showing({ ...BASE, lastCheckedAt: '2026-10-02T12:00:00.000Z' })

    expect(screen.getByText(/You are up to date/)).toBeInTheDocument()
  })

  it('downloads, then offers Restart and update', async () => {
    await showing({ ...BASE, status: 'available', version: '1.1.0' })
    downloadUpdate.mockResolvedValue({ ...BASE, status: 'ready', version: '1.1.0', percent: 100 })

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restart and update' }))

    expect(downloadUpdate).toHaveBeenCalledOnce()
    expect(installUpdate).toHaveBeenCalledOnce()
  })

  it('shows an error from the last check', async () => {
    await showing({ ...BASE, status: 'error', message: 'Could not check for updates.' })

    expect(screen.getByRole('alert')).toHaveTextContent('Could not check for updates.')
  })

  it('has the automatic-check switch, says what it contacts, and saves a change', async () => {
    await showing(BASE)
    setAutoCheck.mockResolvedValue({ ...BASE, autoCheck: false })

    const toggle = screen.getByRole('checkbox', { name: 'Automatically check for updates' })
    expect(toggle).toBeChecked()
    expect(screen.getByText(/contacts github\.com/i)).toBeInTheDocument()
    fireEvent.click(toggle)

    await vi.waitFor(() => expect(setAutoCheck).toHaveBeenCalledExactlyOnceWith(false))
    await vi.waitFor(() => expect(toggle).not.toBeChecked())
  })

  it('shows an alert when a button press fails', async () => {
    await showing(BASE)
    checkForUpdates.mockRejectedValue(new Error('boom'))

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })

  it('shows a generic alert when the last check failed without a message', async () => {
    await showing({ ...BASE, status: 'error' })

    expect(screen.getByRole('alert')).toHaveTextContent('Could not check for updates.')
  })

  it('does not render an empty status line for an error', async () => {
    await showing({ ...BASE, status: 'error', message: 'Nope.' })

    const empty = Array.from(document.querySelectorAll('p')).filter((p) => !p.textContent)
    expect(empty).toHaveLength(0)
  })

  it('shows when the last check ran, as a machine-readable time', async () => {
    await showing({ ...BASE, lastCheckedAt: '2026-10-02T12:00:00.000Z' })

    const time = screen.getByText('Last checked', { exact: false }).querySelector('time')
    expect(time).toHaveAttribute('datetime', '2026-10-02T12:00:00.000Z')
  })

  it('shows no time before any check', async () => {
    await showing(BASE)

    expect(document.querySelector('time')).toBeNull()
  })

  it('offers Download again after a failed download', async () => {
    await showing({
      ...BASE,
      status: 'error',
      version: '1.1.0',
      message: 'Could not download the update.',
    })

    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('does not offer Download after a failed check with no known version', async () => {
    await showing({ ...BASE, status: 'error', message: 'Could not check for updates.' })

    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })
})
