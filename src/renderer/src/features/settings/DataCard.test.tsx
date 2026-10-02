// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportResult } from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { DataCard } from './DataCard'

const exportData = vi.fn<() => Promise<ExportResult>>()

beforeEach(() => {
  window.api = fakeApi({ exportData })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function clickExport() {
  fireEvent.click(screen.getByRole('button', { name: 'Export data…' }))
}

describe('DataCard', () => {
  it('has a titled region and an export button', () => {
    render(<DataCard />)

    expect(screen.getByRole('region', { name: 'Your data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export data…' })).toBeEnabled()
  })

  it('asks for an export once per click', async () => {
    exportData.mockResolvedValue({ kind: 'cancelled' })
    render(<DataCard />)

    clickExport()

    await vi.waitFor(() => expect(exportData).toHaveBeenCalledOnce())
  })

  it('shows where the file went and what was in it', async () => {
    exportData.mockResolvedValue({
      kind: 'saved',
      path: 'C:\\out\\export.json',
      games: 1,
      achievements: 12,
    })
    render(<DataCard />)

    clickExport()

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Saved 1 game and 12 achievements to C:\\out\\export.json')
  })

  it('shows nothing when the save dialog is cancelled', async () => {
    exportData.mockResolvedValue({ kind: 'cancelled' })
    render(<DataCard />)

    clickExport()

    await vi.waitFor(() => expect(exportData).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: 'Export data…' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the previous result when a new export starts', async () => {
    exportData.mockResolvedValueOnce({ kind: 'failed', message: 'Could not save the file.' })
    exportData.mockResolvedValueOnce({ kind: 'cancelled' })
    render(<DataCard />)

    clickExport()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    clickExport()

    await vi.waitFor(() => expect(exportData).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'Export data…' })).toBeEnabled()
  })

  it('shows why saving failed', async () => {
    exportData.mockResolvedValue({ kind: 'failed', message: 'Could not save the file.' })
    render(<DataCard />)

    clickExport()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the file.')
  })

  it('shows a plain message when the call itself fails', async () => {
    exportData.mockRejectedValue(new Error('boom'))
    render(<DataCard />)

    clickExport()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })

  it('disables the button while saving', async () => {
    let finish: (result: ExportResult) => void = () => {}
    exportData.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<DataCard />)

    clickExport()

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    finish({ kind: 'cancelled' })
    expect(await screen.findByRole('button', { name: 'Export data…' })).toBeEnabled()
  })
})
