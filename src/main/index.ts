import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  Notification,
  safeStorage,
  screen,
  shell,
} from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type NotificationSettings } from '@shared/ipc'
import { MAX_LOG_ENTRIES } from '@shared/logs'
import {
  connectEa,
  connectEpic,
  connectPlayStation,
  connectSteam,
  connectUbisoft,
  connectXbox,
  signInToSteam,
} from './accounts'
import { coalesce } from './coalesce'
import { CookieSignIn, isBackHome } from './cookie-sign-in'
import { type CookieSignInPage, openCookieSignInWindow } from './cookie-sign-in-window'
import { DataExporter } from './data-export'
import { registerIpcHandlers, type IpcHandlers } from './ipc'
import { DATABASE_FILE, moveLegacyData } from './legacy-data'
import { captureConsole, captureUncaught } from './logging/capture'
import { Logger } from './logging/logger'
import { readLogs } from './logging/read-logs'
import { createSteamInstallAdapter } from './launch/steam'
import { LaunchService } from './launch/service'
import { spawnDetached } from './launch/spawn'
import { startTarget } from './launch/start'
import { isEaAddress, isSonyAddress, isSteamAddress, mayNavigate } from './navigation'
import { NotificationService } from './notifications'
import { OverlayService } from './overlay-service'
import { EaProvider } from './providers/ea'
import { readSignInCookies } from './providers/ea/auth'
import { EpicProvider } from './providers/epic'
import { EPIC_SIGN_IN_URL } from './providers/epic/auth'
import { LOCAL_FILES } from './providers/local-files'
import { PlayStationProvider } from './providers/playstation'
import { isPsnRedirect, PSN_SIGN_IN_URL, readNpsso } from './providers/playstation/auth'
import { SteamProvider } from './providers/steam'
import { STEAM_LOCAL } from './providers/steam/local'
import { Rpcs3Provider } from './providers/rpcs3'
import { ShadPs4Provider } from './providers/shadps4'
import { readApiKey, readSteamSignIn } from './providers/steam/session'
import { UbisoftProvider } from './providers/ubisoft'
import { XboxProvider } from './providers/xbox'
import { getProfile, windowsUserName } from './profile'
import { SafeStorageSecretStore } from './safe-storage-secret-store'
import { Rpcs3Accounts } from './rpcs3-accounts'
import { ShadPs4Accounts } from './shadps4-accounts'
import { openStorePage } from './store-page'
import { openLogsFolder } from './logs-folder'
import { launchedHidden, setStartWithWindows, startupSettings, startWithWindows } from './startup'
import { nextSampleToast } from './sample-toasts'
import { openDatabase } from './store/database'
import { mergeGames, relinkGames, unlinkPlatformGame } from './store/game-links'
import { awardPlatinums } from './store/platinum'
import { ArtworkService } from './artwork/artwork-service'
import {
  getDashboardStats,
  getGameDetail,
  listActivity,
  listKnownGames,
  listLibraryGames,
  storePageUrl,
} from './store/library-store'
import {
  readLogLevel,
  readNotificationSettings,
  readOnboardingCompleted,
  readUpdateSettings,
  saveLogLevel,
  saveOnboardingCompleted,
  saveProfileName,
  saveUpdateSettings,
  updateNotificationSettings,
} from './store/settings-store'
import { listAccountSummaries } from './store/sync-store'
import { Scheduler } from './sync/scheduler'
import { disconnectAccount, syncNow } from './sync-now'
import { type AppTray, createTray } from './tray'
import { trayUpdateLabel, UpdateService, type UpdaterLike } from './update-service'
import { UbisoftSignIn } from './ubisoft-sign-in'
import { openUbisoftSignInWindow } from './ubisoft-sign-in-window'
import { describeUnlockTiming } from './unlock-timing'
import { createMainWindow, createOverlayWindow } from './windows'
import { XboxSignIn } from './xbox-sign-in'

const EA_SIGN_IN_URL = 'https://www.ea.com/login'
const EA_SIGN_IN_PAGE: CookieSignInPage = {
  title: 'Sign in to EA',
  isSignedIn: isBackHome('https://www.ea.com'),
  cookieDomain: 'ea.com',
  mayNavigate: isEaAddress,
}
const STEAM_SIGN_IN_URL = 'https://store.steampowered.com/login/'
const STEAM_SIGN_IN_PAGE: CookieSignInPage = {
  title: 'Sign in to Steam',
  isSignedIn: isBackHome('https://store.steampowered.com'),
  cookieDomain: 'steampowered.com',
  mayNavigate: isSteamAddress,
}
const ARTWORK_DELAY_MS = 30_000

const PSN_SIGN_IN_PAGE: CookieSignInPage = {
  title: 'Sign in to PlayStation',
  isSignedIn: isPsnRedirect,
  cookieDomain: 'sony.com',
  mayNavigate: isSonyAddress,
}

if (!dataFolderReady() || !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void start()
}

function packagedUpdater(): UpdaterLike {
  autoUpdater.requestHeaders = { 'x-user-staging-id': 'trophy-locker' }
  return autoUpdater as unknown as UpdaterLike
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
  const logsDir = join(app.getPath('userData'), 'logs')
  const logger = new Logger({
    dir: logsDir,
    onProblem: (problem) => process.stderr.write(`Logging problem: ${String(problem)}\n`),
  })
  captureConsole(logger)
  captureUncaught(logger)

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
    contents.on('will-navigate', (event, url) => {
      if (!mayNavigate(contents, url)) event.preventDefault()
    })
  })

  await app.whenReady()
  if (app.isPackaged) Menu.setApplicationMenu(null)

  const { db, schemaVersion } = openDatabase(join(app.getPath('userData'), DATABASE_FILE))
  logger.setLevel(readLogLevel(db))
  relinkGames(db)
  awardPlatinums(db)

  const overlay = new OverlayService(createOverlayWindow())
  const notifications = new NotificationService({
    display: (toasts) => void overlay.display(toasts),
  })
  const sendTestNotification = (): Promise<void> => {
    notifications.show(nextSampleToast())
    return Promise.resolve()
  }

  const applyNotificationSettings = (settings: NotificationSettings): void => {
    notifications.durationMs = settings.durationSec * 1000
    notifications.minRarity = settings.minRarity
    notifications.enabledPlatforms = settings.enabledPlatforms
    overlay.settings = settings
  }
  applyNotificationSettings(readNotificationSettings(db))

  const steam = new SteamProvider()
  const xbox = new XboxProvider()
  const epic = new EpicProvider()
  const ubisoft = new UbisoftProvider()
  const ea = new EaProvider()
  const playstation = new PlayStationProvider()
  const shadps4 = new ShadPs4Provider()
  const rpcs3 = new Rpcs3Provider()
  const chooseFolder = async (title: string): Promise<string | null> => {
    const options: Electron.OpenDialogOptions = { title, properties: ['openDirectory'] }
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
  const xboxSignIn = new XboxSignIn({ openExternal: (url) => shell.openExternal(url) })
  const ubisoftSignIn = new UbisoftSignIn({
    openWindow: (url) =>
      openUbisoftSignInWindow(
        url,
        mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      ),
  })
  const cookieWindow = (page: CookieSignInPage) => (url: string) =>
    openCookieSignInWindow(
      page,
      url,
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    )
  const eaSignIn = new CookieSignIn({
    service: 'EA',
    url: EA_SIGN_IN_URL,
    read: readSignInCookies,
    openWindow: cookieWindow(EA_SIGN_IN_PAGE),
  })
  const steamSignIn = new CookieSignIn({
    service: 'Steam',
    url: STEAM_SIGN_IN_URL,
    read: readSteamSignIn,
    openWindow: cookieWindow(STEAM_SIGN_IN_PAGE),
  })
  const playstationSignIn = new CookieSignIn({
    service: 'PlayStation',
    url: PSN_SIGN_IN_URL,
    read: readNpsso,
    openWindow: cookieWindow(PSN_SIGN_IN_PAGE),
  })
  const secrets = new SafeStorageSecretStore(
    join(app.getPath('userData'), 'secrets.json'),
    safeStorage,
  )
  const dataChanged = coalesce(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.dataChanged)
  }, 1000)
  const launcher = new LaunchService({
    adapters: [
      createSteamInstallAdapter({ readRegistry: STEAM_LOCAL.readRegistry, files: LOCAL_FILES }),
    ],
    known: () => listKnownGames(db),
    start: (target) =>
      startTarget(target, {
        openExternal: (uri) => shell.openExternal(uri),
        spawnProgram: spawnDetached,
        fileExists: (path) =>
          access(path).then(
            () => true,
            () => false,
          ),
      }),
    onChanged: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.installedChanged)
      }
    },
  })
  const artwork = new ArtworkService({ db, secrets, onFound: () => dataChanged() })
  const findArtworkSoon = coalesce(() => void artwork.run(), ARTWORK_DELAY_MS)
  const scheduler = new Scheduler({
    db,
    providers: { steam, xbox, playstation, epic, ubisoft, ea, shadps4, rpcs3 },
    secrets,
    onUnlocks: (events) => {
      for (const event of events) console.info(describeUnlockTiming(event))
      notifications.notify(events)
    },
    onDataChanged: () => {
      dataChanged()
      findArtworkSoon()
    },
    onSyncingChanged: () => dataChanged(),
  })
  scheduler.start()
  findArtworkSoon()
  const shadps4Accounts = new ShadPs4Accounts({
    db,
    shadps4,
    secrets,
    scheduler,
    files: LOCAL_FILES,
    chooseFolder: () => chooseFolder('Choose the shadPS4 data folder or install folder'),
  })
  const rpcs3Accounts = new Rpcs3Accounts({
    db,
    rpcs3,
    secrets,
    scheduler,
    files: LOCAL_FILES,
    chooseFolder: () => chooseFolder('Choose the RPCS3 folder (the one that holds dev_hdd0)'),
  })
  const dataExporter = new DataExporter({
    db,
    appInfo: () => ({ version: app.getVersion(), schemaVersion }),
    chooseFile: async (defaultName) => {
      const options: Electron.SaveDialogOptions = {
        title: 'Export your data',
        defaultPath: join(app.getPath('documents'), defaultName),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }
      const result =
        mainWindow && !mainWindow.isDestroyed()
          ? await dialog.showSaveDialog(mainWindow, options)
          : await dialog.showSaveDialog(options)
      return result.canceled ? null : (result.filePath ?? null)
    },
    writeFile: (path, text) => writeFile(path, text, 'utf8'),
  })
  app.on('before-quit', () => {
    void logger.flush()
    scheduler.stop()
    artwork.stop()
    notifications.stop()
    xboxSignIn.cancel()
    ubisoftSignIn.cancel()
    eaSignIn.cancel()
    playstationSignIn.cancel()
    steamSignIn.cancel()
    updateService.stop()
  })

  const windowsName = windowsUserName()
  let tray: AppTray | null = null
  const setNotificationsPaused = (paused: boolean): void => {
    notifications.paused = paused
    tray?.refresh()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.notificationsPausedChanged, paused)
    }
  }
  const updateAndApplyNotificationSettings: IpcHandlers['updateNotificationSettings'] = (patch) => {
    const settings = updateNotificationSettings(db, patch)
    applyNotificationSettings(settings)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.notificationSettingsChanged, settings)
    }
    return settings
  }

  const startToggle = startWithWindows(app)

  let updateNotification: Notification | null = null
  const updateService = new UpdateService({
    updater: app.isPackaged ? packagedUpdater() : null,
    currentVersion: app.getVersion(),
    settings: {
      read: () => readUpdateSettings(db),
      save: (patch) => saveUpdateSettings(db, patch),
    },
    windowVisible: () =>
      mainWindow !== null &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized(),
    notify: (version) => {
      if (!Notification.isSupported()) return
      const notification = new Notification({
        title: 'Trophy Locker update',
        body: `Version ${version} is available.`,
      })
      const release = (): void => {
        if (updateNotification === notification) updateNotification = null
      }
      notification.on('click', () => {
        release()
        showMainWindow()
      })
      notification.on('close', release)
      updateNotification = notification
      notification.show()
    },
    onChange: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.updateStateChanged, state)
      }
      tray?.refresh()
    },
  })

  registerIpcHandlers({
    getAppInfo: () => ({ version: app.getVersion(), schemaVersion }),
    sendTestNotification,
    getProfile: () => getProfile(db, windowsName),
    setProfileName: (name) => {
      saveProfileName(db, name)
      return getProfile(db, windowsName)
    },
    getOnboardingCompleted: () => readOnboardingCompleted(db),
    completeOnboarding: () => saveOnboardingCompleted(db),
    getNotificationsPaused: () => notifications.paused,
    setNotificationsPaused,
    listAccounts: () => listAccountSummaries(db, (id) => scheduler.isSyncing(id)),
    disconnectAccount: (input) => {
      disconnectAccount({ db, secrets, scheduler }, input)
      dataChanged()
    },
    syncNow: (scope) => syncNow({ db, secrets, scheduler }, scope),
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
    connectEa: () => connectEa({ db, ea, signIn: () => eaSignIn.run(), secrets, scheduler }),
    cancelEaSignIn: () => eaSignIn.cancel(),
    connectPlayStation: () =>
      connectPlayStation({
        db,
        playstation,
        signIn: () => playstationSignIn.run(),
        secrets,
        scheduler,
      }),
    cancelPlayStationSignIn: () => playstationSignIn.cancel(),
    signInToSteam: (input) =>
      signInToSteam(
        {
          db,
          steam,
          signIn: () => steamSignIn.run(),
          readApiKey: (signIn) => readApiKey(signIn),
          secrets,
          scheduler,
        },
        input,
      ),
    cancelSteamSignIn: () => steamSignIn.cancel(),
    findShadPs4: () => shadps4Accounts.find(),
    chooseShadPs4Folder: () => shadps4Accounts.choose(),
    connectShadPs4: (input) => shadps4Accounts.connect(input),
    findRpcs3: () => rpcs3Accounts.find(),
    chooseRpcs3Folder: () => rpcs3Accounts.choose(),
    connectRpcs3: (input) => rpcs3Accounts.connect(input),
    exportData: () => dataExporter.run(),
    getLogSettings: () => ({ level: logger.level, available: logger.available }),
    setLogLevel: (level) => {
      saveLogLevel(db, level)
      logger.setLevel(level)
      return { level, available: logger.available }
    },
    readLogs: async (minLevel) => {
      await logger.flush()
      return readLogs(logsDir, minLevel, MAX_LOG_ENTRIES)
    },
    openLogsFolder: () =>
      openLogsFolder(logsDir, {
        makeFolder: (dir) => mkdir(dir, { recursive: true }),
        openPath: (dir) => shell.openPath(dir),
      }),
    getStartupSettings: () => startupSettings(startToggle),
    setStartWithWindows: (on) => {
      const settings = setStartWithWindows(startToggle, on)
      tray?.refresh()
      return settings
    },
    getUpdateState: () => updateService.state(),
    checkForUpdates: () => updateService.checkNow(),
    downloadUpdate: () => updateService.download(),
    installUpdate: () => updateService.install(),
    dismissUpdate: () => updateService.dismiss(),
    setAutoCheck: (on) => updateService.setAutoCheck(on),
    listLibrary: () => listLibraryGames(db),
    getGame: (id) => getGameDetail(db, id),
    mergeGames: ({ intoGameId, gameId }) => {
      if (mergeGames(db, intoGameId, gameId)) dataChanged()
    },
    unlinkGame: ({ platformGameId }) => {
      if (unlinkPlatformGame(db, platformGameId)) dataChanged()
    },
    openStorePage: async (platformGameId) => {
      await openStorePage(storePageUrl(db, platformGameId), (url) => shell.openExternal(url))
    },
    getInstalled: () => launcher.installed(),
    playGame: (platformGameId) => launcher.play(platformGameId),
    rescanInstalled: async () => {
      await launcher.scan()
      return launcher.installed()
    },
    getArtworkSettings: () => ({
      hasKey: artwork.hasKey(),
      missing: listLibraryGames(db).filter((game) => game.coverUrl === null).length,
      problem: artwork.problem,
    }),
    saveSteamGridDbKey: ({ key }) => artwork.saveKey(key),
    removeSteamGridDbKey: () => artwork.removeKey(),
    findMissingArtwork: () => artwork.run(),
    getDashboard: () => getDashboardStats(db),
    listActivity: (limit) => listActivity(db, limit),
    getNotificationSettings: () => readNotificationSettings(db),
    updateNotificationSettings: updateAndApplyNotificationSettings,
    listDisplays: () => {
      const primaryId = screen.getPrimaryDisplay().id
      return screen.getAllDisplays().map((display, index) => ({
        id: display.id,
        label: display.label.trim() !== '' ? display.label : `Display ${index + 1}`,
        primary: display.id === primaryId,
      }))
    },
  })

  tray = createTray({
    open: showMainWindow,
    syncNow: () => scheduler.syncAllNow(),
    sendTestNotification: () => void sendTestNotification(),
    quit: () => app.quit(),
    pauseNotifications: {
      get: () => notifications.paused,
      set: setNotificationsPaused,
    },
    startWithWindows: startToggle,
    updateLabel: () => trayUpdateLabel(updateService.state()),
  })
  setTimeout(() => void launcher.scan(), 10_000)
  let lastFocusScan = Date.now()
  app.on('browser-window-focus', () => {
    const now = Date.now()
    if (now - lastFocusScan < 60_000) return
    lastFocusScan = now
    void launcher.scan()
  })
  console.info('Ready in the tray')
  updateService.start()

  if (!launchedHidden(process.argv)) showMainWindow()
}
