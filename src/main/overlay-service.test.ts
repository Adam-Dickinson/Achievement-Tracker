import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_NOTIFICATION_SETTINGS, IPC, type NotificationSettings } from '@shared/ipc'
import type { VisibleToast } from '@shared/ipc'

const PRIMARY = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
const SECONDARY = { id: 2, workArea: { x: 1920, y: 0, width: 1280, height: 720 } }

let displays = [PRIMARY, SECONDARY]

vi.mock('electron', () => ({
  screen: {
    getPrimaryDisplay: () => PRIMARY,
    getAllDisplays: () => displays,
  },
}))

const { OverlayService } = await import('./overlay-service')

function toast(id: number): VisibleToast {
  return {
    id,
    heading: 'Achievement unlocked',
    rarity: 'common',
    title: 'Test',
    description: null,
    game: 'Game',
    platform: 'steam',
    percent: 5,
    platinum: false,
  }
}

function fakeWindow() {
  return {
    webContents: {
      isLoading: () => false,
      once: vi.fn(),
      send: vi.fn(),
    },
    isDestroyed: () => false,
    isVisible: () => false,
    showInactive: vi.fn(),
    hide: vi.fn(),
    setBounds: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    moveTop: vi.fn(),
  }
}

beforeEach(() => {
  displays = [PRIMARY, SECONDARY]
})

describe('OverlayService', () => {
  it('positions the window in the bottom-right of the primary display by default', async () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)

    await overlay.display([toast(1)])

    expect(window.setBounds).toHaveBeenCalledWith({ x: 1424, y: 668, width: 480, height: 396 })
  })

  it.each([
    ['top-left', { x: 16, y: 16 }],
    ['top-right', { x: 1424, y: 16 }],
    ['bottom-left', { x: 16, y: 668 }],
    ['bottom-right', { x: 1424, y: 668 }],
  ] as const)('positions the %s corner', async (corner, expected) => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)
    overlay.settings = { ...DEFAULT_NOTIFICATION_SETTINGS, corner }

    await overlay.display([toast(1)])

    expect(window.setBounds).toHaveBeenCalledWith({ ...expected, width: 480, height: 396 })
  })

  it('scales the window size around the anchored corner', async () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)
    overlay.settings = { ...DEFAULT_NOTIFICATION_SETTINGS, size: 'large' }

    await overlay.display([toast(1)])

    expect(window.setBounds).toHaveBeenCalledWith({ x: 1352, y: 609, width: 552, height: 455 })
  })

  it('positions on the chosen monitor', async () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)
    overlay.settings = { ...DEFAULT_NOTIFICATION_SETTINGS, monitor: SECONDARY.id }

    await overlay.display([toast(1)])

    expect(window.setBounds).toHaveBeenCalledWith({ x: 2704, y: 308, width: 480, height: 396 })
  })

  it('falls back to the primary display when the chosen monitor is gone', async () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)
    overlay.settings = { ...DEFAULT_NOTIFICATION_SETTINGS, monitor: 99 }
    displays = [PRIMARY]

    await overlay.display([toast(1)])

    expect(window.setBounds).toHaveBeenCalledWith({ x: 1424, y: 668, width: 480, height: 396 })
  })

  it('sends the corner, scale and sound settings alongside the toasts', async () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)
    overlay.settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      corner: 'top-left',
      size: 'small',
      sound: { enabled: false, volume: 0.2 },
    }

    await overlay.display([toast(1)])

    expect(window.webContents.send).toHaveBeenCalledWith(IPC.setToasts, {
      toasts: [toast(1)],
      corner: 'top-left',
      scale: 0.85,
      sound: { enabled: false, volume: 0.2 },
    })
  })

  it('raises the window to the top of the always-on-top band each time toasts are shown', async () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)

    await overlay.display([toast(1)])
    await overlay.display([toast(1), toast(2)])

    expect(window.setAlwaysOnTop).toHaveBeenCalledTimes(2)
    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(window.moveTop).toHaveBeenCalledTimes(2)
  })

  it('does not raise the window when no toast is showing', async () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)

    await overlay.display([])

    expect(window.moveTop).not.toHaveBeenCalled()
  })

  it('logs where the window was put, so a missing toast can be traced', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const overlay = new OverlayService(fakeWindow() as never)

    await overlay.display([toast(1)])

    expect(info).toHaveBeenCalledWith(
      'Toast overlay: 1 toast on display 1 at 1424,668 (480x396), window was hidden',
    )
    info.mockRestore()
  })

  it('shows the window once when toasts arrive and stays hidden until they do', async () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)

    await overlay.display([toast(1)])

    expect(window.showInactive).toHaveBeenCalledOnce()
  })

  it('hides the window after the exit animation once every toast is gone', async () => {
    vi.useFakeTimers()
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)

    await overlay.display([])
    vi.advanceTimersByTime(400)

    expect(window.hide).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('does nothing when new settings arrive while no toast is showing', () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)

    overlay.settings = { ...DEFAULT_NOTIFICATION_SETTINGS, corner: 'top-left' }

    expect(window.setBounds).not.toHaveBeenCalled()
  })

  it('repositions at once when settings change while a toast is showing', async () => {
    const window = fakeWindow()
    const overlay = new OverlayService(window as never)
    await overlay.display([toast(1)])
    window.setBounds.mockClear()

    overlay.settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      corner: 'top-left',
    } as NotificationSettings

    expect(window.setBounds).toHaveBeenCalledWith({ x: 16, y: 16, width: 480, height: 396 })
  })
})
