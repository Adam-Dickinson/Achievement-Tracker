// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '@/test/fake-api'
import { Settings } from './Settings'

beforeEach(() => {
  window.api = fakeApi()
})

afterEach(cleanup)

describe('Settings', () => {
  it('sends a test toast from the Notifications card', () => {
    render(<Settings />)

    const card = screen.getByRole('region', { name: 'Notifications' })
    fireEvent.click(screen.getByRole('button', { name: 'Send test toast' }))

    expect(card).toContainElement(screen.getByRole('button', { name: 'Send test toast' }))
    expect(window.api.sendTestNotification).toHaveBeenCalledOnce()
  })

  it('shows the Artwork card', () => {
    render(<Settings />)

    expect(screen.getByRole('region', { name: 'Artwork' })).toBeInTheDocument()
  })

  it('shows the app version and database schema once known', async () => {
    render(<Settings />)

    expect(await screen.findByText('Trophy Locker v0.1.0 · database schema 1')).toBeInTheDocument()
  })

  it('leaves the version out until it is known', () => {
    window.api = fakeApi({ getAppInfo: vi.fn().mockReturnValue(new Promise(() => {})) })
    render(<Settings />)

    expect(screen.queryByText(/database schema/)).not.toBeInTheDocument()
  })
})
