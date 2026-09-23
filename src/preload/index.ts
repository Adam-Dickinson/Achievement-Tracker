import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AchievementTrackerApi, type VisibleToast } from '@shared/ipc'

// The preload script runs in a sandbox with access to both worlds. It exposes a small, explicit
// API to the UI as `window.api`. The UI never gets `ipcRenderer` or Node.js itself.
const api: AchievementTrackerApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  sendTestNotification: () => ipcRenderer.invoke(IPC.sendTestNotification),
  listAccounts: () => ipcRenderer.invoke(IPC.listAccounts),
  connectSteam: (input) => ipcRenderer.invoke(IPC.connectSteam, input),
  listLibrary: () => ipcRenderer.invoke(IPC.listLibrary),
  getGame: (id) => ipcRenderer.invoke(IPC.getGame, id),
  getDashboard: () => ipcRenderer.invoke(IPC.getDashboard),
  onDataChanged: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(IPC.dataChanged, handler)
    return () => ipcRenderer.removeListener(IPC.dataChanged, handler)
  },
  onToasts: (listener) => {
    const handler = (_event: IpcRendererEvent, toasts: readonly VisibleToast[]): void =>
      listener(toasts)
    ipcRenderer.on(IPC.setToasts, handler)
    return () => ipcRenderer.removeListener(IPC.setToasts, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
