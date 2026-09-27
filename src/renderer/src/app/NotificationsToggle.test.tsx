// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '@/test/fake-api'
import { NotificationsToggle } from './NotificationsToggle'

afterEach(cleanup)

function listenForChanges() {
  let changed: (paused: boolean) => void = () => {}
  const stop = vi.fn()
  const onNotificationsPausedChanged = vi.fn((listener: (paused: boolean) => void) => {
    changed = listener
    return stop
  })
  return { onNotificationsPausedChanged, stop, change: (paused: boolean) => changed(paused) }
}

async function renderedToggle() {
  render(<NotificationsToggle />)
  const toggle = screen.getByRole('button', { name: 'Pause notifications' })
  await vi.waitFor(() => expect(toggle).toBeEnabled())
  return toggle
}

describe('NotificationsToggle', () => {
  it('is a toggle that is off while notifications are on', async () => {
    window.api = fakeApi()

    const toggle = await renderedToggle()

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('title', 'Pause notifications')
  })

  it('is pressed while notifications are paused', async () => {
    window.api = fakeApi({ getNotificationsPaused: vi.fn().mockResolvedValue(true) })

    const toggle = await renderedToggle()

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute('title', 'Notifications are paused. Click to turn them back on.')
  })

  it('is disabled until the current setting is known', () => {
    window.api = fakeApi({ getNotificationsPaused: vi.fn().mockReturnValue(new Promise(() => {})) })
    render(<NotificationsToggle />)

    expect(screen.getByRole('button', { name: 'Pause notifications' })).toBeDisabled()
  })

  it.each([
    [false, true],
    [true, false],
  ])('asks for paused to go from %s to %s when clicked', async (paused, next) => {
    window.api = fakeApi({ getNotificationsPaused: vi.fn().mockResolvedValue(paused) })
    const toggle = await renderedToggle()

    fireEvent.click(toggle)

    expect(window.api.setNotificationsPaused).toHaveBeenCalledExactlyOnceWith(next)
  })

  it('follows a change made elsewhere, such as the tray', async () => {
    const events = listenForChanges()
    window.api = fakeApi({ onNotificationsPausedChanged: events.onNotificationsPausedChanged })
    const toggle = await renderedToggle()

    act(() => events.change(true))

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('stops listening once it is gone', () => {
    const events = listenForChanges()
    window.api = fakeApi({ onNotificationsPausedChanged: events.onNotificationsPausedChanged })
    const { unmount } = render(<NotificationsToggle />)

    unmount()

    expect(events.stop).toHaveBeenCalledOnce()
  })
})
