// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const sendTestNotification = vi.fn()

beforeEach(() => {
  // In the real app the preload script provides window.api; in tests we provide a fake.
  window.api = {
    getAppInfo: vi.fn().mockResolvedValue({ version: '0.1.0', schemaVersion: 1 }),
    sendTestNotification,
    onToasts: vi.fn(() => () => {}),
    listAccounts: vi.fn().mockResolvedValue([]),
    connectSteam: vi.fn(),
    onAccountsChanged: vi.fn(() => () => {}),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('App', () => {
  it('starts on the dashboard and switches page when a nav item is clicked', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Library' }))

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    // The footer fills in once the main process replies.
    expect(await screen.findByText('v0.1.0 · schema 1')).toBeInTheDocument()
  })

  it('shows the Accounts screen on the Accounts page', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Accounts' }))

    expect(await screen.findByText('No accounts connected yet.')).toBeInTheDocument()
    expect(window.api.listAccounts).toHaveBeenCalledOnce()
  })

  it('asks the main process for a test notification', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Send test notification' }))

    expect(sendTestNotification).toHaveBeenCalledOnce()
    await screen.findByText('v0.1.0 · schema 1') // let the pending state update settle
  })
})
