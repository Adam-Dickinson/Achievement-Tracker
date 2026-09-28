import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, safeStorage, screen, shell } from 'electron'
import { IPC, type NotificationSettings } from '@shared/ipc'
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
import { registerIpcHandlers, type IpcHandlers } from './ipc'
import { DATABASE_FILE, moveLegacyData } from './legacy-data'
import { isEaAddress, isSonyAddress, isSteamAddress, mayNavigate } from './navigation'
import { NotificationService } from './notifications'
import { OverlayService } from './overlay-service'
import { EaProvider } from './providers/ea'
import { readSignInCookies } from './providers/ea/auth'
import { EpicProvider } from './providers/epic'
import { EPIC_SIGN_IN_URL } from './providers/epic/auth'
import { PlayStationProvider } from './providers/playstation'
import { isPsnRedirect, PSN_SIGN_IN_URL, readNpsso } from './providers/playstation/auth'
import { SteamProvider } from './providers/steam'
import { readApiKey, readSteamSignIn } from './providers/steam/session'
import { UbisoftProvider } from './providers/ubisoft'
import { XboxProvider } from './providers/xbox'
import { getProfile, windowsUserName } from './profile'
import { SafeStorageSecretStore } from './safe-storage-secret-store'
import { openStorePage } from './store-page'
import { launchedHidden, startWithWindows } from './startup'
import { nextSampleToast } from './sample-toasts'
import { openDatabase } from './store/database'
import { mergeGames, relinkGames, unlinkPlatformGame } from './store/game-links'
import { awardPlatinums } from './store/platinum'
import { ArtworkService } from './artwork/artwork-service'
import {
  getDashboardStats,
  getGameDetail,
  listActivity,
  listLibraryGames,
  storePageUrl,
} from './store/library-store'
import {
  readNotificationSettings,
  saveProfileName,
  updateNotificationSettings,
} from './store/settings-store'
import { listAccountSummaries } from './store/sync-store'
import { Scheduler } from './sync/scheduler'
import { disconnectAccount, syncNow } from './sync-now'
import { type AppTray, createTray } from './tray'
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
    contents.on('will-navigate', (event, url) => {
      if (!mayNavigate(contents, url)) event.preventDefault()
    })
  })

  await app.whenReady()
  if (app.isPackaged) Menu.setApplicationMenu(null)

  const { db, schemaVersion } = openDatabase(join(app.getPath('userData'), DATABASE_FILE))
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
  const artwork = new ArtworkService({ db, secrets, onFound: () => dataChanged() })
  const findArtworkSoon = coalesce(() => void artwork.run(), ARTWORK_DELAY_MS)
  const scheduler = new Scheduler({
    db,
    providers: { steam, xbox, playstation, epic, ubisoft, ea },
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
  app.on('before-quit', () => {
    scheduler.stop()
    artwork.stop()
    notifications.stop()
    xboxSignIn.cancel()
    ubisoftSignIn.cancel()
    eaSignIn.cancel()
    playstationSignIn.cancel()
    steamSignIn.cancel()
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

  registerIpcHandlers({
    getAppInfo: () => ({ version: app.getVersion(), schemaVersion }),
    sendTestNotification,
    getProfile: () => getProfile(db, windowsName),
    setProfileName: (name) => {
      saveProfileName(db, name)
      return getProfile(db, windowsName)
    },
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
    startWithWindows: startWithWindows(app),
  })

  if (!launchedHidden(process.argv)) showMainWindow()
}
