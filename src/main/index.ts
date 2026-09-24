import { join } from 'node:path'
import { app, BrowserWindow, Menu, safeStorage } from 'electron'
import { IPC } from '@shared/ipc'
import { connectSteam } from './accounts'
import { coalesce } from './coalesce'
import { registerIpcHandlers } from './ipc'
import { NotificationService } from './notifications'
import { OverlayService } from './overlay-service'
import { SteamProvider } from './providers/steam'
import { SafeStorageSecretStore } from './safe-storage-secret-store'
import { launchedHidden, startWithWindows } from './startup'
import { nextSampleToast } from './sample-toasts'
import { openDatabase } from './store/database'
import { getDashboardStats, getGameDetail, listLibraryGames } from './store/library-store'
import { listAccountSummaries } from './store/sync-store'
import { Scheduler } from './sync/scheduler'
import { createTray } from './tray'
import { createMainWindow, createOverlayWindow } from './windows'

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void start()
}

async function start(): Promise<void> {
  let mainWindow: BrowserWindow | null = null

  const showMainWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow()
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  app.on('second-instance', showMainWindow)
  app.on('window-all-closed', () => {})

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event) => event.preventDefault())
  })

  await app.whenReady()
  if (app.isPackaged) Menu.setApplicationMenu(null)

  const { db, schemaVersion } = openDatabase(
    join(app.getPath('userData'), 'achievement-tracker.db'),
  )

  const overlay = new OverlayService(createOverlayWindow())
  const notifications = new NotificationService({
    display: (toasts) => void overlay.display(toasts),
  })
  const sendTestNotification = (): Promise<void> => {
    notifications.show(nextSampleToast())
    return Promise.resolve()
  }

  const steam = new SteamProvider()
  const secrets = new SafeStorageSecretStore(
    join(app.getPath('userData'), 'secrets.json'),
    safeStorage,
  )
  const dataChanged = coalesce(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.dataChanged)
  }, 1000)
  const scheduler = new Scheduler({
    db,
    providers: { steam },
    secrets,
    onUnlocks: (events) => notifications.notify(events),
    onDataChanged: dataChanged,
  })
  scheduler.start()
  app.on('before-quit', () => {
    scheduler.stop()
    notifications.stop()
  })

  registerIpcHandlers({
    getAppInfo: () => ({ version: app.getVersion(), schemaVersion }),
    sendTestNotification,
    listAccounts: () => listAccountSummaries(db),
    connectSteam: (input) => connectSteam({ db, steam, secrets, scheduler }, input),
    listLibrary: () => listLibraryGames(db),
    getGame: (id) => getGameDetail(db, id),
    getDashboard: () => getDashboardStats(db),
  })

  createTray({
    open: showMainWindow,
    sendTestNotification: () => void sendTestNotification(),
    quit: () => app.quit(),
    pauseNotifications: {
      get: () => notifications.paused,
      set: (on) => {
        notifications.paused = on
      },
    },
    startWithWindows: startWithWindows(app),
  })

  if (!launchedHidden(process.argv)) showMainWindow()
}
