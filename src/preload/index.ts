import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AchievementTrackerApi, type ToastPayload } from '@shared/ipc'

// The preload script runs in a sandbox with access to both worlds. It exposes a small, explicit
// API to the UI as `window.api`. The UI never gets `ipcRenderer` or Node.js itself.
const api: AchievementTrackerApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  sendTestNotification: () => ipcRenderer.invoke(IPC.sendTestNotification),
  onToast: (listener) => {
    const handler = (_event: IpcRendererEvent, toast: ToastPayload): void => listener(toast)
    ipcRenderer.on(IPC.showToast, handler)
    return () => ipcRenderer.removeListener(IPC.showToast, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
