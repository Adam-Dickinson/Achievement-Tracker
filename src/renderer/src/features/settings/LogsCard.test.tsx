// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry, LogLevel, LogSettings } from '@shared/logs'
import { fakeApi } from '@/test/fake-api'
import { LogsCard } from './LogsCard'

const ENTRIES: LogEntry[] = [
  { time: '2026-10-02T12:00:00.000Z', level: 'info', message: 'Synced 12 games' },
  {
    time: '2026-10-02T12:01:00.000Z',
    level: 'error',
    message: 'Sync failed',
    data: { name: 'Error', message: 'boom' },
  },
]

const getLogSettings = vi.fn<() => Promise<LogSettings>>()
const setLogLevel = vi.fn<(level: LogLevel) => Promise<LogSettings>>()
const readLogs = vi.fn<(minLevel: LogLevel) => Promise<LogEntry[]>>()
const openLogsFolder = vi.fn<() => Promise<void>>()

beforeEach(() => {
  getLogSettings.mockResolvedValue({ level: 'info' })
  setLogLevel.mockImplementation((level) => Promise.resolve({ level }))
  readLogs.mockResolvedValue(ENTRIES)
  openLogsFolder.mockResolvedValue(undefined)
  window.api = fakeApi({ getLogSettings, setLogLevel, readLogs, openLogsFolder })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('LogsCard', () => {
  it('has a titled region', () => {
    render(<LogsCard />)

    expect(screen.getByRole('region', { name: 'Logs' })).toBeInTheDocument()
  })

  it('lists the entries with their level and message', async () => {
    render(<LogsCard />)

    const list = await screen.findByRole('list', { name: 'Log entries' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Synced 12 games')
    expect(items[1]).toHaveTextContent('Sync failed')
    expect(items[1]).toHaveTextContent('Error')
  })

  it('shows the saved logging level', async () => {
    getLogSettings.mockResolvedValue({ level: 'warn' })
    render(<LogsCard />)

    await vi.waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Logging level' })).toHaveValue('warn'),
    )
  })

  it('saves a new logging level', async () => {
    render(<LogsCard />)
    await screen.findByRole('list', { name: 'Log entries' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Logging level' }), {
      target: { value: 'debug' },
    })

    await vi.waitFor(() => expect(setLogLevel).toHaveBeenCalledExactlyOnceWith('debug'))
    await vi.waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Logging level' })).toHaveValue('debug'),
    )
  })

  it('reads again at the level chosen in the filter', async () => {
    render(<LogsCard />)
    await screen.findByRole('list', { name: 'Log entries' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Show entries from' }), {
      target: { value: 'error' },
    })

    await vi.waitFor(() => expect(readLogs).toHaveBeenLastCalledWith('error'))
  })

  it('reads again when Refresh is clicked', async () => {
    render(<LogsCard />)
    await screen.findByRole('list', { name: 'Log entries' })
    const before = readLogs.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await vi.waitFor(() => expect(readLogs.mock.calls.length).toBe(before + 1))
  })

  it('opens the logs folder', async () => {
    render(<LogsCard />)

    fireEvent.click(screen.getByRole('button', { name: 'Open logs folder' }))

    await vi.waitFor(() => expect(openLogsFolder).toHaveBeenCalledOnce())
  })

  it('says so when nothing is logged at this level', async () => {
    readLogs.mockResolvedValue([])
    render(<LogsCard />)

    expect(await screen.findByText('Nothing logged at this level yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Log entries' })).not.toBeInTheDocument()
  })

  it('shows an alert when the log cannot be read', async () => {
    readLogs.mockRejectedValue(new Error('denied'))
    render(<LogsCard />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read the log.')
  })
})
