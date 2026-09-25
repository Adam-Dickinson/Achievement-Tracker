import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, safeStorage, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { connectEpic, connectSteam, connectUbisoft, connectXbox } from './accounts'
import { coalesce } from './coalesce'
import { registerIpcHandlers } from './ipc'
import { DATABASE_FILE, moveLegacyData } from './legacy-data'
import { NotificationService } from './notifications'
import { OverlayService } from './overlay-service'
import { EpicProvider } from './providers/epic'
import { EPIC_SIGN_IN_URL } from './providers/epic/auth'
import { SteamProvider } from './providers/steam'
import { UbisoftProvider } from './providers/ubisoft'
import { XboxProvider } from './providers/xbox'
import { SafeStorageSecretStore } from './safe-storage-secret-store'
import { launchedHidden, startWithWindows } from './startup'
import { nextSampleToast } from './sample-toasts'
import { openDatabase } from './store/database'
import {
  getDashboardStats,
  getGameDetail,
  listActivity,
  listLibraryGames,
} from './store/library-store'
import { listAccountSummaries } from './store/sync-store'
import { Scheduler } from './sync/scheduler'
import { createTray } from './tray'
import { UbisoftSignIn } from './ubisoft-sign-in'
import { openUbisoftSignInWindow } from './ubisoft-sign-in-window'
import { describeUnlockTiming } from './unlock-timing'
import { createMainWindow, createOverlayWindow } from './windows'
import { XboxSignIn } from './xbox-sign-in'

if (!dataFolderReady() || !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void start()
}

function dataFolderReady(): boolean {
  try {
    if (moveLegacyData(app.getPath('appData'), app.getPath('userData'))) {
      console.info('Moved the data folder from achievement-tracker to trophy-locker')
    }
    return true
  } catch (error) {
    dialog.showErrorBox(
      'Trophy Locker could not move your data',
      `Close Achievement Tracker if it is still running, then start Trophy Locker again.\n\n${String(error)}`,
    )
    return false
  }
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

  const { db, schemaVersion } = openDatabase(join(app.getPath('userData'), DATABASE_FILE))

  const overlay = new OverlayService(createOverlayWindow())
  const notifications = new NotificationService({
    display: (toasts) => void overlay.display(toasts),
  })
  const sendTestNotification = (): Promise<void> => {
    notifications.show(nextSampleToast())
    return Promise.resolve()
  }

  const steam = new SteamProvider()
  const xbox = new XboxProvider()
  const epic = new EpicProvider()
  const ubisoft = new UbisoftProvider()
  const xboxSignIn = new XboxSignIn({ openExternal: (url) => shell.openExternal(url) })
  const ubisoftSignIn = new UbisoftSignIn({
    openWindow: (url) =>
      openUbisoftSignInWindow(
        url,
        mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      ),
  })
  const secrets = new SafeStorageSecretStore(
    join(app.getPath('userData'), 'secrets.json'),
    safeStorage,
  )
  const dataChanged = coalesce(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.dataChanged)
  }, 1000)
  const scheduler = new Scheduler({
    db,
    providers: { steam, xbox, epic, ubisoft },
    secrets,
    onUnlocks: (events) => {
      for (const event of events) console.info(describeUnlockTiming(event))
      notifications.notify(events)
    },
    onDataChanged: dataChanged,
  })
  scheduler.start()
  app.on('before-quit', () => {
    scheduler.stop()
    notifications.stop()
    xboxSignIn.cancel()
    ubisoftSignIn.cancel()
  })

  registerIpcHandlers({
    getAppInfo: () => ({ version: app.getVersion(), schemaVersion }),
    sendTestNotification,
    listAccounts: () => listAccountSummaries(db),
    connectSteam: (input) => connectSteam({ db, steam, secrets, scheduler }, input),
    connectXbox: async () => {
      const result = await connectXbox({
        db,
        xbox,
        signIn: () => xboxSignIn.run(),
        secrets,
        scheduler,
      })
      showMainWindow()
      return result
    },
    cancelXboxSignIn: () => xboxSignIn.cancel(),
    openEpicSignIn: () => shell.openExternal(EPIC_SIGN_IN_URL),
    connectEpic: (input) => connectEpic({ db, epic, secrets, scheduler }, input),
    connectUbisoft: () =>
      connectUbisoft({ db, ubisoft, signIn: () => ubisoftSignIn.run(), secrets, scheduler }),
    cancelUbisoftSignIn: () => ubisoftSignIn.cancel(),
    listLibrary: () => listLibraryGames(db),
    getGame: (id) => getGameDetail(db, id),
    getDashboard: () => getDashboardStats(db),
    listActivity: (limit) => listActivity(db, limit),
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
