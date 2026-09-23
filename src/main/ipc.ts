import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { DashboardStats } from '@shared/dashboard'
import {
  IPC,
  type AccountSummary,
  type AppInfo,
  type ConnectResult,
  type SteamConnectInput,
} from '@shared/ipc'
import type { GameDetail, LibraryGame } from '@shared/library'

export interface IpcHandlers {
  getAppInfo(): AppInfo
  sendTestNotification(): Promise<void>
  listAccounts(): AccountSummary[]
  connectSteam(input: SteamConnectInput): Promise<ConnectResult>
  listLibrary(): LibraryGame[]
  getGame(id: number): GameDetail | null
  getDashboard(): DashboardStats
}

// The UI is untrusted: its payloads are checked here before anything else sees them.
const steamConnectInputSchema = z.object({
  steamId: z.string().trim().min(1).max(100),
  apiKey: z.string().trim().min(1).max(100),
})

const gameIdSchema = z.number().int().positive()

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

  ipcMain.handle(IPC.listAccounts, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.listAccounts()
  })

  ipcMain.handle(IPC.connectSteam, (event, input: unknown): Promise<ConnectResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = steamConnectInputSchema.safeParse(input)
    if (!parsed.success) {
      // Paths and codes only: never log what was typed.
      console.warn(
        'connectSteam: invalid input',
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`),
      )
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: invalidInputMessage(parsed.error.issues[0]),
      })
    }
    return handlers.connectSteam(parsed.data)
  })

  ipcMain.handle(IPC.listLibrary, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.listLibrary()
  })

  ipcMain.handle(IPC.getGame, (event, id: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = gameIdSchema.safeParse(id)
    return parsed.success ? handlers.getGame(parsed.data) : null
  })

  ipcMain.handle(IPC.getDashboard, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getDashboard()
  })
}

function invalidInputMessage(issue: z.core.$ZodIssue | undefined): string {
  const tooLong = issue?.code === 'too_big'
  switch (issue?.path[0]) {
    case 'steamId':
      return tooLong ? 'That SteamID is too long: it should be 17 digits.' : 'Enter your SteamID.'
    case 'apiKey':
      return tooLong
        ? 'That key is too long: it should be 32 letters and digits.'
        : 'Enter your Steam API key.'
    default:
      return 'Enter both your SteamID and your Steam API key.'
  }
}
