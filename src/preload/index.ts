import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type NotificationSettings,
  type OverlayFrame,
  type TrophyLockerApi,
} from '@shared/ipc'
import type { UpdateState } from '@shared/updates'

const api: TrophyLockerApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  sendTestNotification: () => ipcRenderer.invoke(IPC.sendTestNotification),
  getProfile: () => ipcRenderer.invoke(IPC.getProfile),
  setProfileName: (name) => ipcRenderer.invoke(IPC.setProfileName, name),
  getOnboardingCompleted: () => ipcRenderer.invoke(IPC.getOnboardingCompleted),
  completeOnboarding: () => ipcRenderer.invoke(IPC.completeOnboarding),
  getNotificationsPaused: () => ipcRenderer.invoke(IPC.getNotificationsPaused),
  setNotificationsPaused: (paused) => ipcRenderer.invoke(IPC.setNotificationsPaused, paused),
  listAccounts: () => ipcRenderer.invoke(IPC.listAccounts),
  disconnectAccount: (input) => ipcRenderer.invoke(IPC.disconnectAccount, input),
  syncNow: (scope) => ipcRenderer.invoke(IPC.syncNow, scope),
  connectSteam: (input) => ipcRenderer.invoke(IPC.connectSteam, input),
  connectXbox: (input) => ipcRenderer.invoke(IPC.connectXbox, input),
  cancelXboxSignIn: () => ipcRenderer.invoke(IPC.cancelXboxSignIn),
  openEpicSignIn: () => ipcRenderer.invoke(IPC.openEpicSignIn),
  connectEpic: (input) => ipcRenderer.invoke(IPC.connectEpic, input),
  findShadPs4: () => ipcRenderer.invoke(IPC.findShadPs4),
  chooseShadPs4Folder: () => ipcRenderer.invoke(IPC.chooseShadPs4Folder),
  connectShadPs4: (input) => ipcRenderer.invoke(IPC.connectShadPs4, input),
  findRpcs3: () => ipcRenderer.invoke(IPC.findRpcs3),
  chooseRpcs3Folder: () => ipcRenderer.invoke(IPC.chooseRpcs3Folder),
  connectRpcs3: (input) => ipcRenderer.invoke(IPC.connectRpcs3, input),
  exportData: () => ipcRenderer.invoke(IPC.exportData),
  getLogSettings: () => ipcRenderer.invoke(IPC.getLogSettings),
  setLogLevel: (level) => ipcRenderer.invoke(IPC.setLogLevel, level),
  readLogs: (minLevel) => ipcRenderer.invoke(IPC.readLogs, minLevel),
  openLogsFolder: () => ipcRenderer.invoke(IPC.openLogsFolder),
  getStartupSettings: () => ipcRenderer.invoke(IPC.getStartupSettings),
  setStartWithWindows: (on) => ipcRenderer.invoke(IPC.setStartWithWindows, on),
  getUpdateState: () => ipcRenderer.invoke(IPC.getUpdateState),
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  downloadUpdate: () => ipcRenderer.invoke(IPC.downloadUpdate),
  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),
  dismissUpdate: () => ipcRenderer.invoke(IPC.dismissUpdate),
  setAutoCheck: (on) => ipcRenderer.invoke(IPC.setAutoCheck, on),
  onUpdateStateChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on(IPC.updateStateChanged, handler)
    return () => ipcRenderer.removeListener(IPC.updateStateChanged, handler)
  },
  connectUbisoft: (input) => ipcRenderer.invoke(IPC.connectUbisoft, input),
  cancelUbisoftSignIn: () => ipcRenderer.invoke(IPC.cancelUbisoftSignIn),
  connectEa: (input) => ipcRenderer.invoke(IPC.connectEa, input),
  cancelEaSignIn: () => ipcRenderer.invoke(IPC.cancelEaSignIn),
  connectPlayStation: (input) => ipcRenderer.invoke(IPC.connectPlayStation, input),
  cancelPlayStationSignIn: () => ipcRenderer.invoke(IPC.cancelPlayStationSignIn),
  signInToSteam: (input) => ipcRenderer.invoke(IPC.signInToSteam, input),
  cancelSteamSignIn: () => ipcRenderer.invoke(IPC.cancelSteamSignIn),
  listLibrary: () => ipcRenderer.invoke(IPC.listLibrary),
  getGame: (id) => ipcRenderer.invoke(IPC.getGame, id),
  mergeGames: (input) => ipcRenderer.invoke(IPC.mergeGames, input),
  unlinkGame: (input) => ipcRenderer.invoke(IPC.unlinkGame, input),
  openStorePage: (platformGameId) => ipcRenderer.invoke(IPC.openStorePage, platformGameId),
  getArtworkSettings: () => ipcRenderer.invoke(IPC.getArtworkSettings),
  saveSteamGridDbKey: (input) => ipcRenderer.invoke(IPC.saveSteamGridDbKey, input),
  removeSteamGridDbKey: () => ipcRenderer.invoke(IPC.removeSteamGridDbKey),
  findMissingArtwork: () => ipcRenderer.invoke(IPC.findMissingArtwork),
  getDashboard: () => ipcRenderer.invoke(IPC.getDashboard),
  listActivity: (limit) => ipcRenderer.invoke(IPC.listActivity, limit),
  getNotificationSettings: () => ipcRenderer.invoke(IPC.getNotificationSettings),
  updateNotificationSettings: (patch) => ipcRenderer.invoke(IPC.updateNotificationSettings, patch),
  listDisplays: () => ipcRenderer.invoke(IPC.listDisplays),
  getInstalled: () => ipcRenderer.invoke(IPC.getInstalled),
  playGame: (platformGameId) => ipcRenderer.invoke(IPC.playGame, platformGameId),
  rescanInstalled: () => ipcRenderer.invoke(IPC.rescanInstalled),
  getEmulatorPrograms: () => ipcRenderer.invoke(IPC.getEmulatorPrograms),
  chooseEmulatorProgram: (emulator) => ipcRenderer.invoke(IPC.chooseEmulatorProgram, emulator),
  onInstalledChanged: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(IPC.installedChanged, handler)
    return () => ipcRenderer.removeListener(IPC.installedChanged, handler)
  },
  onDataChanged: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(IPC.dataChanged, handler)
    return () => ipcRenderer.removeListener(IPC.dataChanged, handler)
  },
  onToasts: (listener) => {
    const handler = (_event: IpcRendererEvent, frame: OverlayFrame): void => listener(frame)
    ipcRenderer.on(IPC.setToasts, handler)
    return () => ipcRenderer.removeListener(IPC.setToasts, handler)
  },
  onNotificationsPausedChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, paused: boolean): void => listener(paused)
    ipcRenderer.on(IPC.notificationsPausedChanged, handler)
    return () => ipcRenderer.removeListener(IPC.notificationsPausedChanged, handler)
  },
  onNotificationSettingsChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, settings: NotificationSettings): void =>
      listener(settings)
    ipcRenderer.on(IPC.notificationSettingsChanged, handler)
    return () => ipcRenderer.removeListener(IPC.notificationSettingsChanged, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
