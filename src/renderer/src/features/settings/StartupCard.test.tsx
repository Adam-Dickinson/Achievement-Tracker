// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StartupSettings } from '@shared/logs'
import { fakeApi } from '@/test/fake-api'
import { StartupCard } from './StartupCard'

const getStartupSettings = vi.fn<() => Promise<StartupSettings>>()
const setStartWithWindows = vi.fn<(on: boolean) => Promise<StartupSettings>>()

beforeEach(() => {
  window.api = fakeApi({ getStartupSettings, setStartWithWindows })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('StartupCard', () => {
  it('has a titled region', () => {
    getStartupSettings.mockResolvedValue({ available: true, enabled: false })
    render(<StartupCard />)

    expect(screen.getByRole('region', { name: 'Startup' })).toBeInTheDocument()
  })

  it('shows the switch off or on as it is now', async () => {
    getStartupSettings.mockResolvedValue({ available: true, enabled: true })
    render(<StartupCard />)

    const toggle = await screen.findByRole('checkbox', { name: 'Start with Windows' })
    await vi.waitFor(() => expect(toggle).toBeChecked())
    expect(toggle).toBeEnabled()
  })

  it('turns it on', async () => {
    getStartupSettings.mockResolvedValue({ available: true, enabled: false })
    setStartWithWindows.mockResolvedValue({ available: true, enabled: true })
    render(<StartupCard />)
    const toggle = await screen.findByRole('checkbox', { name: 'Start with Windows' })

    fireEvent.click(toggle)

    await vi.waitFor(() => expect(setStartWithWindows).toHaveBeenCalledExactlyOnceWith(true))
    await vi.waitFor(() => expect(toggle).toBeChecked())
  })

  it('shows the real state when the change did not stick', async () => {
    getStartupSettings.mockResolvedValue({ available: true, enabled: false })
    setStartWithWindows.mockResolvedValue({ available: true, enabled: false })
    render(<StartupCard />)
    const toggle = await screen.findByRole('checkbox', { name: 'Start with Windows' })

    fireEvent.click(toggle)

    await vi.waitFor(() => expect(setStartWithWindows).toHaveBeenCalled())
    await vi.waitFor(() => expect(toggle).not.toBeChecked())
  })

  it('is disabled, with a reason, when the app is not installed', async () => {
    getStartupSettings.mockResolvedValue({ available: false, enabled: false })
    render(<StartupCard />)

    expect(await screen.findByRole('checkbox', { name: 'Start with Windows' })).toBeDisabled()
    expect(screen.getByText('Available in the installed app.')).toBeInTheDocument()
  })

  it('shows an alert when the change fails', async () => {
    getStartupSettings.mockResolvedValue({ available: true, enabled: false })
    setStartWithWindows.mockRejectedValue(new Error('denied'))
    render(<StartupCard />)

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Start with Windows' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change this setting.')
  })
})
