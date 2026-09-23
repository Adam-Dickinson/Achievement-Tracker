import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import appIcon from '../../resources/icon.png?asset'

/**
 * Overlay window size in DIPs: room for three stacked 400x92 toasts 12px apart, plus room for
 * their glow and shadow (40px at each side, 32px above, 64px below). Keep in step with the
 * padding and gap in overlay/OverlayApp.tsx and MAX_VISIBLE in notifications.ts.
 */
export const OVERLAY_SIZE = { width: 480, height: 396 } as const

// Security defaults for every window: the UI is web content, so it gets no Node.js access.
// It talks to the main process only through the small API the preload script exposes.
const webPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const

function loadRenderer(window: BrowserWindow, page: 'index.html' | 'overlay.html'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void window.loadURL(`${devUrl}/${page}`)
  } else {
    void window.loadFile(join(__dirname, `../renderer/${page}`))
  }
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false, // shown on 'ready-to-show' so there's no white flash
    title: 'Achievement Tracker',
    backgroundColor: '#0B0D12',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences,
  })
  window.once('ready-to-show', () => window.show())
  loadRenderer(window, 'index.html')
  return window
}

/**
 * The toast host: transparent, frameless, always on top, click-through and unable to take focus,
 * so it can never interfere with a game. Created hidden at startup so a toast appears instantly.
 * It only changes its own window; nothing is injected into other processes.
 */
export function createOverlayWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...OVERLAY_SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false, // never steals focus from the game
    alwaysOnTop: true,
    webPreferences,
  })
  window.setAlwaysOnTop(true, 'screen-saver') // above everything except exclusive-fullscreen games
  window.setIgnoreMouseEvents(true) // clicks fall through to whatever is underneath
  loadRenderer(window, 'overlay.html')
  return window
}
