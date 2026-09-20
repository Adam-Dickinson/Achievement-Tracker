import { screen, type BrowserWindow } from 'electron'
import { IPC, type ToastPayload } from '@shared/ipc'
import { OVERLAY_SIZE } from './windows'

const SCREEN_MARGIN = 16
/** Time for the toast's exit animation to finish before the window is hidden. */
const EXIT_ANIMATION_MS = 400

/**
 * Shows unlock toasts in the overlay window (docs/DESIGN.md §6). M1 adds the queue, stacking
 * and burst collapsing; for now a new toast simply replaces the current one.
 */
export class OverlayService {
  #hideTimer: NodeJS.Timeout | null = null

  constructor(private readonly window: BrowserWindow) {}

  async show(toast: Omit<ToastPayload, 'durationMs'>, durationMs = 5000): Promise<void> {
    if (this.window.isDestroyed()) return

    if (this.window.webContents.isLoading()) {
      await new Promise<void>((resolve) => this.window.webContents.once('did-finish-load', resolve))
    }

    this.#positionBottomRight()
    // showInactive: display the window without activating it (i.e. without taking focus).
    if (!this.window.isVisible()) this.window.showInactive()
    this.window.webContents.send(IPC.showToast, { ...toast, durationMs } satisfies ToastPayload)

    if (this.#hideTimer) clearTimeout(this.#hideTimer)
    this.#hideTimer = setTimeout(() => {
      if (!this.window.isDestroyed()) this.window.hide()
    }, durationMs + EXIT_ANIMATION_MS)
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
