import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type TrophyLockerApi, type VisibleToast } from '@shared/ipc'

const api: TrophyLockerApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  sendTestNotification: () => ipcRenderer.invoke(IPC.sendTestNotification),
  listAccounts: () => ipcRenderer.invoke(IPC.listAccounts),
  connectSteam: (input) => ipcRenderer.invoke(IPC.connectSteam, input),
  connectXbox: (input) => ipcRenderer.invoke(IPC.connectXbox, input),
  cancelXboxSignIn: () => ipcRenderer.invoke(IPC.cancelXboxSignIn),
  openEpicSignIn: () => ipcRenderer.invoke(IPC.openEpicSignIn),
  connectEpic: (input) => ipcRenderer.invoke(IPC.connectEpic, input),
  connectUbisoft: (input) => ipcRenderer.invoke(IPC.connectUbisoft, input),
  cancelUbisoftSignIn: () => ipcRenderer.invoke(IPC.cancelUbisoftSignIn),
  connectEa: (input) => ipcRenderer.invoke(IPC.connectEa, input),
  cancelEaSignIn: () => ipcRenderer.invoke(IPC.cancelEaSignIn),
  listLibrary: () => ipcRenderer.invoke(IPC.listLibrary),
  getGame: (id) => ipcRenderer.invoke(IPC.getGame, id),
  getDashboard: () => ipcRenderer.invoke(IPC.getDashboard),
  listActivity: (limit) => ipcRenderer.invoke(IPC.listActivity, limit),
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
