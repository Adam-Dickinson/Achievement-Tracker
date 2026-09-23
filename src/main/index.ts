import { join } from 'node:path'
import { app, BrowserWindow, Menu, safeStorage } from 'electron'
import { connectSteam } from './accounts'
import { registerIpcHandlers } from './ipc'
import { OverlayService } from './overlay-service'
import { SteamProvider } from './providers/steam'
import { SafeStorageSecretStore } from './safe-storage-secret-store'
import { nextSampleToast } from './sample-toasts'
import { openDatabase } from './store/database'
import { listAccountSummaries } from './store/sync-store'
import { Scheduler } from './sync/scheduler'
import { createTray } from './tray'
import { createMainWindow, createOverlayWindow } from './windows'

// Only one copy of the app may run: a second launch just brings the first one forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void start()
}

async function start(): Promise<void> {
  let mainWindow: BrowserWindow | null = null

  // Closing the main window destroys it (freeing its renderer process and memory); the app keeps
  // running in the tray and recreates the window on demand. Only "Quit" exits.
  const showMainWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow()
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  app.on('second-instance', showMainWindow)
  // Stay alive with no windows open: the tray icon is what keeps the app reachable.
  app.on('window-all-closed', () => {})

  // Hardening: app windows never open new windows or navigate away from our own pages.
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event) => event.preventDefault())
  })

  await app.whenReady()
  // Packaged builds have no menu bar. In development the default menu stays, so DevTools
  // (Ctrl+Shift+I, or Alt > View > Toggle Developer Tools) is available for debugging the UI.
  if (app.isPackaged) Menu.setApplicationMenu(null)

  const { db, schemaVersion } = openDatabase(
    join(app.getPath('userData'), 'achievement-tracker.db'),
  )

  // The sync engine. It idles until an account is connected on the Accounts screen. The
  // notification service that will receive onUnlocks is its own M1 item.
  const steam = new SteamProvider()
  const secrets = new SafeStorageSecretStore(
    join(app.getPath('userData'), 'secrets.json'),
    safeStorage,
  )
  const scheduler = new Scheduler({
    db,
    providers: { steam },
    secrets,
    onUnlocks: () => undefined,
  })
  scheduler.start()
  app.on('before-quit', () => scheduler.stop())

  const overlay = new OverlayService(createOverlayWindow())
  const sendTestNotification = (): Promise<void> => overlay.show(nextSampleToast())

  registerIpcHandlers({
    getAppInfo: () => ({ version: app.getVersion(), schemaVersion }),
    sendTestNotification,
    listAccounts: () => listAccountSummaries(db),
    connectSteam: (input) => connectSteam({ db, steam, secrets, scheduler }, input),
  })

  createTray({
    open: showMainWindow,
    sendTestNotification: () => void sendTestNotification(),
    quit: () => app.quit(),
  })

  showMainWindow()
}
