// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type NotificationSettingsPatch,
} from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { NotificationsCard } from './NotificationsCard'

const updateNotificationSettings =
  vi.fn<(patch: NotificationSettingsPatch) => Promise<NotificationSettings>>()
let stored: NotificationSettings

beforeEach(() => {
  stored = DEFAULT_NOTIFICATION_SETTINGS
  updateNotificationSettings.mockImplementation((patch) => {
    stored = {
      ...stored,
      ...patch,
      enabledPlatforms: { ...stored.enabledPlatforms, ...patch.enabledPlatforms },
      sound: { ...stored.sound, ...patch.sound },
    }
    return Promise.resolve(stored)
  })
  window.api = fakeApi({
    getNotificationSettings: vi.fn(() => Promise.resolve(stored)),
    updateNotificationSettings,
    listDisplays: vi.fn().mockResolvedValue([
      { id: 11, label: 'Display 1', primary: true },
      { id: 22, label: 'Display 2', primary: false },
    ]),
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

async function renderCard() {
  render(<NotificationsCard />)
  await screen.findByRole('heading', { name: 'Placement' })
}

describe('NotificationsCard', () => {
  it('shows no controls until the settings have loaded', () => {
    window.api = fakeApi({
      getNotificationSettings: vi.fn(() => new Promise<NotificationSettings>(() => {})),
    })
    render(<NotificationsCard />)

    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Placement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send test toast' })).not.toBeInTheDocument()
  })

  it('shows the Placement, triggers and Sound cards once loaded', async () => {
    await renderCard()

    expect(screen.getByRole('heading', { name: 'What triggers a toast' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sound' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Live preview' })).toBeInTheDocument()
  })

  it('marks the saved corner and saves a new one', async () => {
    await renderCard()
    const corners = screen.getByRole('group', { name: 'Screen corner' })

    expect(within(corners).getByRole('button', { name: 'Bottom right' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(within(corners).getByRole('button', { name: 'Top left' }))

    expect(updateNotificationSettings).toHaveBeenCalledWith({ corner: 'top-left' })
    expect(await within(corners).findByRole('button', { name: 'Top left' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('lists the primary display and every connected display', async () => {
    await renderCard()
    const monitor = screen.getByRole('combobox', { name: 'Monitor' })

    expect(await within(monitor).findByRole('option', { name: 'Display 2' })).toBeInTheDocument()
    expect(within(monitor).getByRole('option', { name: 'Primary display' })).toBeInTheDocument()
    expect(within(monitor).getByRole('option', { name: 'Display 1 (primary)' })).toBeInTheDocument()
    expect(monitor).toHaveValue('primary')
  })

  it('saves a chosen display by its numeric id, and the primary as primary', async () => {
    await renderCard()
    const monitor = screen.getByRole('combobox', { name: 'Monitor' })
    await within(monitor).findByRole('option', { name: 'Display 2' })

    fireEvent.change(monitor, { target: { value: '22' } })
    expect(updateNotificationSettings).toHaveBeenLastCalledWith({ monitor: 22 })

    fireEvent.change(monitor, { target: { value: 'primary' } })
    expect(updateNotificationSettings).toHaveBeenLastCalledWith({ monitor: 'primary' })
  })

  it('saves the size', async () => {
    await renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Large' }))

    expect(updateNotificationSettings).toHaveBeenCalledWith({ size: 'large' })
  })

  it('shows the duration and saves a new one', async () => {
    await renderCard()
    const slider = screen.getByRole('slider', { name: 'Stay on screen' })

    expect(slider).toHaveValue('5')
    fireEvent.change(slider, { target: { value: '8.5' } })

    expect(updateNotificationSettings).toHaveBeenCalledWith({ durationSec: 8.5 })
    expect(await screen.findByText('8.5s')).toBeInTheDocument()
  })

  it('saves the minimum rarity', async () => {
    await renderCard()
    const group = screen.getByRole('group', { name: 'Minimum rarity' })

    expect(within(group).getByRole('button', { name: 'Common+' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(within(group).getByRole('button', { name: 'Rare+' }))

    expect(updateNotificationSettings).toHaveBeenCalledWith({ minRarity: 'rare' })
  })

  it('has a switch for each platform that can unlock achievements, and no others', async () => {
    await renderCard()

    for (const name of [
      'Steam',
      'Xbox',
      'PlayStation',
      'Epic Games',
      'Ubisoft Connect',
      'EA app',
    ]) {
      expect(screen.getByRole('switch', { name: `${name} notifications` })).toBeChecked()
    }
    expect(screen.queryByRole('switch', { name: 'RPCS3 notifications' })).not.toBeInTheDocument()
  })

  it('turns one platform off without touching the others', async () => {
    await renderCard()

    fireEvent.click(screen.getByRole('switch', { name: 'Xbox notifications' }))

    expect(updateNotificationSettings).toHaveBeenCalledWith({ enabledPlatforms: { xbox: false } })
    expect(
      await screen.findByRole('switch', { name: 'Xbox notifications', checked: false }),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Steam notifications' })).toBeChecked()
  })

  it('turns the sound off, keeping the volume', async () => {
    await renderCard()

    fireEvent.click(screen.getByRole('switch', { name: 'Play a sound' }))

    expect(updateNotificationSettings).toHaveBeenCalledWith({
      sound: { enabled: false, volume: 0.6 },
    })
  })

  it('shows the volume as a percentage and saves a new one, keeping the sound on', async () => {
    await renderCard()

    expect(screen.getByText('60%')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.3' } })

    expect(updateNotificationSettings).toHaveBeenCalledWith({
      sound: { enabled: true, volume: 0.3 },
    })
    expect(await screen.findByText('30%')).toBeInTheDocument()
  })

  it('previews an ultra rare toast at the saved corner and duration', async () => {
    await renderCard()

    expect(screen.getByText('Bottom right · 5.0s')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('data-rarity', 'ultra_rare')
  })

  it('switches the preview to another rarity without saving anything', async () => {
    await renderCard()

    fireEvent.change(screen.getByRole('combobox', { name: 'Preview rarity' }), {
      target: { value: 'common' },
    })

    expect(screen.getByRole('status')).toHaveAttribute('data-rarity', 'common')
    expect(screen.getByText('Welcome Aboard')).toBeInTheDocument()
    expect(updateNotificationSettings).not.toHaveBeenCalled()
  })

  it('sends a test toast', async () => {
    await renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Send test toast' }))

    expect(window.api.sendTestNotification).toHaveBeenCalledOnce()
  })
})
