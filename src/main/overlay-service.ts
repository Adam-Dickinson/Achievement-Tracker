import { screen, type BrowserWindow } from 'electron'
import { IPC, type VisibleToast } from '@shared/ipc'
import { OVERLAY_SIZE } from './windows'

const SCREEN_MARGIN = 16
/** Time for the last toast's exit animation to finish before the window is hidden. */
const EXIT_ANIMATION_MS = 400

/**
 * Shows the overlay window while there are toasts and sends it the list to draw (docs/DESIGN.md
 * §6). Which toasts are on screen, and for how long, is NotificationService's job.
 */
export class OverlayService {
  #hideTimer: NodeJS.Timeout | null = null
  #loaded: Promise<void>

  constructor(private readonly window: BrowserWindow) {
    this.#loaded = window.webContents.isLoading()
      ? new Promise((resolve) => window.webContents.once('did-finish-load', () => resolve()))
      : Promise.resolve()
  }

  async display(toasts: readonly VisibleToast[]): Promise<void> {
    await this.#loaded
    if (this.window.isDestroyed()) return

    if (this.#hideTimer) clearTimeout(this.#hideTimer)
    this.#hideTimer = null

    if (toasts.length > 0) {
      this.#positionBottomRight()
      // showInactive: display the window without activating it (i.e. without taking focus).
      if (!this.window.isVisible()) this.window.showInactive()
    } else {
      this.#hideTimer = setTimeout(() => {
        if (!this.window.isDestroyed()) this.window.hide()
      }, EXIT_ANIMATION_MS)
    }
    this.window.webContents.send(IPC.setToasts, toasts)
  }

  #positionBottomRight(): void {
    const { workArea } = screen.getPrimaryDisplay()
    this.window.setBounds({
      x: workArea.x + workArea.width - OVERLAY_SIZE.width - SCREEN_MARGIN,
      y: workArea.y + workArea.height - OVERLAY_SIZE.height - SCREEN_MARGIN,
      ...OVERLAY_SIZE,
    })
  }
}
