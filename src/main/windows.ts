import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import appIcon from '../../resources/icon.ico?asset'

export const OVERLAY_SIZE = { width: 480, height: 396 } as const

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
    title: 'Trophy Locker',
    backgroundColor: '#0B0D12',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences,
  })
  window.once('ready-to-show', () => window.show())
  loadRenderer(window, 'index.html')
  return window
}

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
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setIgnoreMouseEvents(true)
  loadRenderer(window, 'overlay.html')
  return window
}
