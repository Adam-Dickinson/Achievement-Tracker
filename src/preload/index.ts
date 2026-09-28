import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type NotificationSettings,
  type OverlayFrame,
  type TrophyLockerApi,
} from '@shared/ipc'

const api: TrophyLockerApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  sendTestNotification: () => ipcRenderer.invoke(IPC.sendTestNotification),
  getProfile: () => ipcRenderer.invoke(IPC.getProfile),
  setProfileName: (name) => ipcRenderer.invoke(IPC.setProfileName, name),
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
