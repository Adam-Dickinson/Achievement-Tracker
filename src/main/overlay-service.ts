import { screen, type BrowserWindow, type Display, type Rectangle } from 'electron'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  IPC,
  TOAST_SCALE,
  type NotificationSettings,
  type VisibleToast,
} from '@shared/ipc'
import { OVERLAY_SIZE } from './windows'

const SCREEN_MARGIN = 16
const EXIT_ANIMATION_MS = 400

export class OverlayService {
  #hideTimer: NodeJS.Timeout | null = null
  #loaded: Promise<void>
  #settings: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS
  #toasts: readonly VisibleToast[] = []

  constructor(private readonly window: BrowserWindow) {
    this.#loaded = window.webContents.isLoading()
      ? new Promise((resolve) => window.webContents.once('did-finish-load', () => resolve()))
      : Promise.resolve()
  }

  set settings(settings: NotificationSettings) {
    this.#settings = settings
    if (this.#toasts.length > 0) this.#reposition()
  }

  async display(toasts: readonly VisibleToast[]): Promise<void> {
    this.#toasts = toasts
    await this.#loaded
    if (this.window.isDestroyed()) return

    if (this.#hideTimer) clearTimeout(this.#hideTimer)
    this.#hideTimer = null

    if (toasts.length > 0) {
      this.#reposition()
      if (!this.window.isVisible()) this.window.showInactive()
    } else {
      this.#hideTimer = setTimeout(() => {
        if (!this.window.isDestroyed()) this.window.hide()
      }, EXIT_ANIMATION_MS)
    }
    this.window.webContents.send(IPC.setToasts, {
      toasts,
      corner: this.#settings.corner,
      scale: TOAST_SCALE[this.#settings.size],
      sound: this.#settings.sound,
    })
  }

  #reposition(): void {
    const scale = TOAST_SCALE[this.#settings.size]
    const width = Math.round(OVERLAY_SIZE.width * scale)
    const height = Math.round(OVERLAY_SIZE.height * scale)
    const { workArea } = this.#resolveDisplay()
    this.window.setBounds({
      ...cornerOrigin(this.#settings.corner, workArea, width, height),
      width,
      height,
    })
  }

  #resolveDisplay(): Display {
    const { monitor } = this.#settings
    if (monitor === 'primary') return screen.getPrimaryDisplay()
    return (
      screen.getAllDisplays().find((display) => display.id === monitor) ??
      screen.getPrimaryDisplay()
    )
  }
}

function cornerOrigin(
  corner: NotificationSettings['corner'],
  workArea: Rectangle,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = corner.endsWith('left')
    ? workArea.x + SCREEN_MARGIN
    : workArea.x + workArea.width - width - SCREEN_MARGIN
  const y = corner.startsWith('top')
    ? workArea.y + SCREEN_MARGIN
    : workArea.y + workArea.height - height - SCREEN_MARGIN
  return { x, y }
}
