// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/updates'
import { fakeApi } from '@/test/fake-api'
import { UpdateBanner } from './UpdateBanner'

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
const downloadUpdate = vi.fn<() => Promise<UpdateState>>()
const dismissUpdate = vi.fn<() => Promise<UpdateState>>()
const installUpdate = vi.fn<() => Promise<void>>()
let push: (state: UpdateState) => void = () => undefined

beforeEach(() => {
  installUpdate.mockResolvedValue(undefined)
  window.api = fakeApi({
    getUpdateState,
    downloadUpdate,
    dismissUpdate,
    installUpdate,
    onUpdateStateChanged: (listener) => {
      push = listener
      return () => undefined
    },
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

async function showing(state: UpdateState) {
  getUpdateState.mockResolvedValue(state)
  render(<UpdateBanner />)
  await vi.waitFor(() => expect(getUpdateState).toHaveBeenCalled())
  await act(async () => {})
}

describe('UpdateBanner', () => {
  it.each([
    ['disabled', { ...BASE, status: 'disabled' as const }],
    ['idle', BASE],
    ['checking', { ...BASE, status: 'checking' as const }],
    ['an error', { ...BASE, status: 'error' as const, message: 'Could not check for updates.' }],
    [
      'a dismissed update',
      { ...BASE, status: 'available' as const, version: '1.1.0', dismissed: true },
    ],
  ])('shows nothing for %s', async (_label, state) => {
    await showing(state)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('announces an available update with Download and Later', async () => {
    await showing({ ...BASE, status: 'available', version: '1.1.0' })

    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent('Version 1.1.0 is available.')
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument()
  })

  it('starts the download when Download is clicked, and shows what comes back', async () => {
    await showing({ ...BASE, status: 'available', version: '1.1.0' })
    downloadUpdate.mockResolvedValue({
      ...BASE,
      status: 'downloading',
      version: '1.1.0',
      percent: 0,
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Download' }))

    expect(downloadUpdate).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('progressbar', { name: 'Download progress' }),
    ).toBeInTheDocument()
  })

  it('hides the banner when Later is clicked', async () => {
    await showing({ ...BASE, status: 'available', version: '1.1.0' })
    dismissUpdate.mockResolvedValue({
      ...BASE,
      status: 'available',
      version: '1.1.0',
      dismissed: true,
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Later' }))

    expect(dismissUpdate).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('shows download progress as it is pushed', async () => {
    await showing({ ...BASE, status: 'downloading', version: '1.1.0', percent: 10 })

    expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '10')
    act(() => push({ ...BASE, status: 'downloading', version: '1.1.0', percent: 60 }))

    await vi.waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('value', '60'))
  })

  it('offers Restart and update once the download is ready', async () => {
    await showing({ ...BASE, status: 'ready', version: '1.1.0', percent: 100 })

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Version 1.1.0 is ready to install.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restart and update' }))

    expect(installUpdate).toHaveBeenCalledOnce()
  })

  it('appears when a push says an update was found', async () => {
    await showing(BASE)

    act(() => push({ ...BASE, status: 'available', version: '1.2.0' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Version 1.2.0 is available.')
  })

  it('stays put when a button press is rejected', async () => {
    await showing({ ...BASE, status: 'available', version: '1.1.0' })
    downloadUpdate.mockRejectedValue(new Error('boom'))

    fireEvent.click(await screen.findByRole('button', { name: 'Download' }))

    await vi.waitFor(() => expect(downloadUpdate).toHaveBeenCalledOnce())
    expect(screen.getByRole('status')).toHaveTextContent('Version 1.1.0 is available.')
  })

  it('keeps a pushed state when the initial read resolves afterwards', async () => {
    let resolveInitial: (state: UpdateState) => void = () => undefined
    getUpdateState.mockReturnValue(
      new Promise<UpdateState>((resolve) => {
        resolveInitial = resolve
      }),
    )
    render(<UpdateBanner />)
    await vi.waitFor(() => expect(getUpdateState).toHaveBeenCalled())

    act(() => push({ ...BASE, status: 'available', version: '1.2.0' }))
    await act(async () => resolveInitial(BASE))

    expect(screen.getByRole('status')).toHaveTextContent('Version 1.2.0 is available.')
  })

  it('stops listening for pushes when it unmounts', async () => {
    const unsubscribe = vi.fn()
    window.api = fakeApi({
      getUpdateState: getUpdateState.mockResolvedValue(BASE),
      onUpdateStateChanged: () => unsubscribe,
    })
    const { unmount } = render(<UpdateBanner />)

    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it.each([
    ['Download', { ...BASE, status: 'available' as const, version: '1.1.0' }, downloadUpdate],
    ['Later', { ...BASE, status: 'available' as const, version: '1.1.0' }, dismissUpdate],
    ['Restart and update', { ...BASE, status: 'ready' as const, version: '1.1.0' }, installUpdate],
  ])('fires %s only once on a double click', async (name, state, call) => {
    await showing(state)
    call.mockReturnValue(new Promise<never>(() => undefined))
    const button = await screen.findByRole('button', { name })

    fireEvent.click(button)
    fireEvent.click(button)

    expect(call).toHaveBeenCalledOnce()
    expect(button).toBeDisabled()
  })
})
