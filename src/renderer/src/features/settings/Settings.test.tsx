// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { Settings } from './Settings'

const PROFILE: Profile = { name: null, windowsName: 'adamg' }

beforeEach(() => {
  window.api = fakeApi()
})

afterEach(cleanup)

function renderSettings(profile: Profile | null = PROFILE) {
  return render(<Settings profile={profile} onRename={() => Promise.resolve()} />)
}

describe('Settings', () => {
  it('shows the Profile card once the profile is known', () => {
    renderSettings()

    expect(screen.getByRole('region', { name: 'Profile' })).toBeInTheDocument()
  })

  it('leaves the Profile card out until the profile is known', () => {
    renderSettings(null)

    expect(screen.queryByRole('region', { name: 'Profile' })).not.toBeInTheDocument()
  })

  it('sends a test toast from the Notifications card', async () => {
    renderSettings()

    const card = screen.getByRole('region', { name: 'Notifications' })
    const button = await screen.findByRole('button', { name: 'Send test toast' })
    fireEvent.click(button)

    expect(card).toContainElement(button)
    expect(window.api.sendTestNotification).toHaveBeenCalledOnce()
  })

  it('shows the Artwork card', () => {
    renderSettings()

    expect(screen.getByRole('region', { name: 'Artwork' })).toBeInTheDocument()
  })

  it('shows the Your data card', async () => {
    renderSettings()

    expect(await screen.findByRole('region', { name: 'Your data' })).toBeInTheDocument()
  })

  it('shows the app version and database schema once known', async () => {
    renderSettings()

    expect(await screen.findByText('Trophy Locker v0.1.0 · database schema 1')).toBeInTheDocument()
  })

  it('leaves the version out until it is known', () => {
    window.api = fakeApi({ getAppInfo: vi.fn().mockReturnValue(new Promise(() => {})) })
    renderSettings()

    expect(screen.queryByText(/database schema/)).not.toBeInTheDocument()
  })
})
