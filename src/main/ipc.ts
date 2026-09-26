import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { DashboardStats } from '@shared/dashboard'
import {
  IPC,
  type AccountSummary,
  type AppInfo,
  type ConnectResult,
  type EaConnectInput,
  type EpicConnectInput,
  type PlayStationConnectInput,
  type SteamConnectInput,
  type SteamSignInInput,
  type UbisoftConnectInput,
  type XboxConnectInput,
} from '@shared/ipc'
import {
  type ActivityPage,
  type GameDetail,
  type LibraryGame,
  MAX_ACTIVITY_LIMIT,
} from '@shared/library'

export interface IpcHandlers {
  getAppInfo(): AppInfo
  sendTestNotification(): Promise<void>
  listAccounts(): AccountSummary[]
  connectSteam(input: SteamConnectInput): Promise<ConnectResult>
  connectXbox(input: XboxConnectInput): Promise<ConnectResult>
  cancelXboxSignIn(): void
  openEpicSignIn(): Promise<void>
  connectEpic(input: EpicConnectInput): Promise<ConnectResult>
  connectUbisoft(input: UbisoftConnectInput): Promise<ConnectResult>
  cancelUbisoftSignIn(): void
  connectEa(input: EaConnectInput): Promise<ConnectResult>
  cancelEaSignIn(): void
  connectPlayStation(input: PlayStationConnectInput): Promise<ConnectResult>
  cancelPlayStationSignIn(): void
  signInToSteam(input: SteamSignInInput): Promise<ConnectResult>
  cancelSteamSignIn(): void
  listLibrary(): LibraryGame[]
  getGame(id: number): GameDetail | null
  getDashboard(): DashboardStats
  listActivity(limit: number): ActivityPage
}

const steamConnectInputSchema = z.object({
  steamId: z.string().trim().min(1).max(100),
  apiKey: z.string().trim().min(1).max(100),
})

const unofficialOptInSchema = z.object({ acceptedUnofficial: z.literal(true) })

const steamSignInSchema = z.object({
  includeFamily: z.boolean(),
  acceptedUnofficial: z.literal(true),
})

const epicConnectInputSchema = z.object({
  code: z.string().trim().min(1).max(2000),
  acceptedUnofficial: z.literal(true),
})

const gameIdSchema = z.number().int().positive()

const activityLimitSchema = z.number().int().min(1).max(MAX_ACTIVITY_LIMIT)

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

  ipcMain.handle(IPC.connectXbox, (event, input: unknown): Promise<ConnectResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = unofficialOptInSchema.safeParse(input)
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: 'Confirm that you understand the Xbox connection is unofficial.',
      })
    }
    return handlers.connectXbox(parsed.data)
  })

  ipcMain.handle(IPC.cancelXboxSignIn, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    handlers.cancelXboxSignIn()
  })

  ipcMain.handle(IPC.connectUbisoft, (event, input: unknown): Promise<ConnectResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = unofficialOptInSchema.safeParse(input)
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: 'Confirm that you understand the Ubisoft connection is unofficial.',
      })
    }
    return handlers.connectUbisoft(parsed.data)
  })

  ipcMain.handle(IPC.cancelUbisoftSignIn, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    handlers.cancelUbisoftSignIn()
  })

  ipcMain.handle(IPC.connectEa, (event, input: unknown): Promise<ConnectResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = unofficialOptInSchema.safeParse(input)
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: 'Confirm that you understand the EA connection is unofficial.',
      })
    }
    return handlers.connectEa(parsed.data)
  })

  ipcMain.handle(IPC.cancelEaSignIn, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    handlers.cancelEaSignIn()
  })

  ipcMain.handle(IPC.connectPlayStation, (event, input: unknown): Promise<ConnectResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = unofficialOptInSchema.safeParse(input)
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: 'Confirm that you understand the PlayStation connection is unofficial.',
      })
    }
    return handlers.connectPlayStation(parsed.data)
  })

  ipcMain.handle(IPC.cancelPlayStationSignIn, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    handlers.cancelPlayStationSignIn()
  })

  ipcMain.handle(IPC.signInToSteam, (event, input: unknown): Promise<ConnectResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = steamSignInSchema.safeParse(input)
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: 'Confirm that you understand signing in to Steam here is unofficial.',
      })
    }
    return handlers.signInToSteam(parsed.data)
  })

  ipcMain.handle(IPC.cancelSteamSignIn, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    handlers.cancelSteamSignIn()
  })

  ipcMain.handle(IPC.openEpicSignIn, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.openEpicSignIn()
  })

  ipcMain.handle(IPC.connectEpic, (event, input: unknown): Promise<ConnectResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = epicConnectInputSchema.safeParse(input)
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: epicInvalidInputMessage(parsed.error.issues[0]),
      })
    }
    return handlers.connectEpic({ code: parsed.data.code, acceptedUnofficial: true })
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

  ipcMain.handle(IPC.listActivity, (event, limit: unknown): ActivityPage => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = activityLimitSchema.safeParse(limit)
    return parsed.success ? handlers.listActivity(parsed.data) : { unlocks: [], hasMore: false }
  })
}

function epicInvalidInputMessage(issue: z.core.$ZodIssue | undefined): string {
  if (issue?.path[0] === 'code') {
    return issue.code === 'too_big'
      ? "That's too long to be Epic's code. Copy just the Epic page and paste it here."
      : "Paste the code from Epic's page."
  }
  return 'Confirm that you understand the Epic connection is unofficial.'
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
