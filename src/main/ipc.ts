import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo } from '@shared/ipc'

interface IpcHandlers {
  getAppInfo(): AppInfo
  sendTestNotification(): Promise<void>
}

/** Only pages we ship may call the main process (never remote content). */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return url.startsWith('file://') || (devUrl !== undefined && url.startsWith(devUrl))
}

export function registerIpcHandlers(handlers: IpcHandlers): void {
  ipcMain.handle(IPC.getAppInfo, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getAppInfo()
  })

  ipcMain.handle(IPC.sendTestNotification, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.sendTestNotification()
  })
}
