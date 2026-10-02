import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { DashboardStats } from '@shared/dashboard'
import {
  IPC,
  TOAST_CORNERS,
  TOAST_SIZES,
  type AccountSummary,
  type AppInfo,
  type ArtworkKeyResult,
  type ArtworkRun,
  type ArtworkSettings,
  type ChooseEmulatorFolderResult,
  type ConnectResult,
  type DisconnectInput,
  type DisplayInfo,
  type EaConnectInput,
  type EmulatorConnectInput,
  type EmulatorFolder,
  type EpicConnectInput,
  MAX_PROFILE_NAME,
  type MergeGamesInput,
  type NotificationSettings,
  type NotificationSettingsPatch,
  type PlayStationConnectInput,
  type Profile,
  type SteamConnectInput,
  type SteamGridDbKeyInput,
  type SteamSignInInput,
  type SyncScope,
  type UnlinkGameInput,
  type UbisoftConnectInput,
  type XboxConnectInput,
} from '@shared/ipc'
import {
  type ActivityPage,
  type GameDetail,
  type LibraryGame,
  MAX_ACTIVITY_LIMIT,
} from '@shared/library'
import { PLATFORMS } from '@shared/platform'
import { RARITIES } from '@shared/rarity'

export interface IpcHandlers {
  getAppInfo(): AppInfo
  sendTestNotification(): Promise<void>
  getProfile(): Profile
  setProfileName(name: string | null): Profile
  getOnboardingCompleted(): boolean
  completeOnboarding(): void
  getNotificationsPaused(): boolean
  setNotificationsPaused(paused: boolean): void
  listAccounts(): AccountSummary[]
  disconnectAccount(input: DisconnectInput): void
  syncNow(scope: SyncScope): Promise<void>
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
  findShadPs4(): Promise<EmulatorFolder | null>
  chooseShadPs4Folder(): Promise<ChooseEmulatorFolderResult>
  connectShadPs4(input: EmulatorConnectInput): Promise<ConnectResult>
  findRpcs3(): Promise<EmulatorFolder | null>
  chooseRpcs3Folder(): Promise<ChooseEmulatorFolderResult>
  connectRpcs3(input: EmulatorConnectInput): Promise<ConnectResult>
  listLibrary(): LibraryGame[]
  getGame(id: number): GameDetail | null
  mergeGames(input: MergeGamesInput): void
  unlinkGame(input: UnlinkGameInput): void
  openStorePage(platformGameId: number): Promise<void>
  getArtworkSettings(): ArtworkSettings
  saveSteamGridDbKey(input: SteamGridDbKeyInput): Promise<ArtworkKeyResult>
  removeSteamGridDbKey(): void
  findMissingArtwork(): Promise<ArtworkRun>
  getDashboard(): DashboardStats
  listActivity(limit: number): ActivityPage
  getNotificationSettings(): NotificationSettings
  updateNotificationSettings(patch: NotificationSettingsPatch): NotificationSettings
  listDisplays(): DisplayInfo[]
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

const emulatorConnectSchema = z.object({
  path: z.string().min(1).max(1024),
  userId: z.string().regex(/^\d{1,10}$/),
})

const gameIdSchema = z.number().int().positive()

const mergeGamesSchema = z
  .object({ intoGameId: gameIdSchema, gameId: gameIdSchema })
  .refine((input) => input.intoGameId !== input.gameId)

const unlinkGameSchema = z.object({ platformGameId: gameIdSchema })

const steamGridDbKeySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{16,64}$/),
})

const disconnectSchema = z.object({ accountId: gameIdSchema, keepData: z.boolean() })

const syncScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('account'), accountId: gameIdSchema }),
  z.object({ kind: z.literal('game'), gameId: gameIdSchema }),
])

const profileNameSchema = z.string().trim().max(MAX_PROFILE_NAME)

const activityLimitSchema = z.number().int().min(1).max(MAX_ACTIVITY_LIMIT)

const enabledPlatformsPatchSchema = z
  .object(Object.fromEntries(PLATFORMS.map((platform) => [platform, z.boolean().optional()])))
  .strict()

const notificationSettingsPatchSchema = z.object({
  corner: z.enum(TOAST_CORNERS).optional(),
  monitor: z.union([z.literal('primary'), z.number().int().nonnegative()]).optional(),
  size: z.enum(TOAST_SIZES).optional(),
  durationSec: z.number().min(1).max(30).optional(),
  minRarity: z.enum(RARITIES).optional(),
  enabledPlatforms: enabledPlatformsPatchSchema.optional(),
  sound: z
    .object({ enabled: z.boolean().optional(), volume: z.number().min(0).max(1).optional() })
    .optional(),
})

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

  ipcMain.handle(IPC.getProfile, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getProfile()
  })

  ipcMain.handle(IPC.setProfileName, (event, name: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = profileNameSchema.safeParse(name)
    if (!parsed.success) return handlers.getProfile()
    return handlers.setProfileName(parsed.data === '' ? null : parsed.data)
  })

  ipcMain.handle(IPC.getOnboardingCompleted, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getOnboardingCompleted()
  })

  ipcMain.handle(IPC.completeOnboarding, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    handlers.completeOnboarding()
  })

  ipcMain.handle(IPC.getNotificationsPaused, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getNotificationsPaused()
  })

  ipcMain.handle(IPC.setNotificationsPaused, (event, paused: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    if (typeof paused === 'boolean') handlers.setNotificationsPaused(paused)
  })

  ipcMain.handle(IPC.listAccounts, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.listAccounts()
  })

  ipcMain.handle(IPC.disconnectAccount, (event, input: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = disconnectSchema.safeParse(input)
    if (parsed.success) handlers.disconnectAccount(parsed.data)
  })

  ipcMain.handle(IPC.syncNow, (event, scope: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = syncScopeSchema.safeParse(scope)
    return parsed.success ? handlers.syncNow(parsed.data) : Promise.resolve()
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

  ipcMain.handle(IPC.findShadPs4, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.findShadPs4()
  })

  ipcMain.handle(IPC.chooseShadPs4Folder, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.chooseShadPs4Folder()
  })

  ipcMain.handle(IPC.connectShadPs4, (event, input: unknown): Promise<ConnectResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = emulatorConnectSchema.safeParse(input)
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: 'Choose a shadPS4 folder and user to connect.',
      })
    }
    return handlers.connectShadPs4(parsed.data)
  })

  ipcMain.handle(IPC.findRpcs3, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.findRpcs3()
  })

  ipcMain.handle(IPC.chooseRpcs3Folder, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.chooseRpcs3Folder()
  })

  ipcMain.handle(IPC.connectRpcs3, (event, input: unknown): Promise<ConnectResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = emulatorConnectSchema.safeParse(input)
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: 'Choose an RPCS3 folder and user to connect.',
      })
    }
    return handlers.connectRpcs3(parsed.data)
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

  ipcMain.handle(IPC.mergeGames, (event, input: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = mergeGamesSchema.safeParse(input)
    if (parsed.success) handlers.mergeGames(parsed.data)
  })

  ipcMain.handle(IPC.unlinkGame, (event, input: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = unlinkGameSchema.safeParse(input)
    if (parsed.success) handlers.unlinkGame(parsed.data)
  })

  ipcMain.handle(IPC.openStorePage, (event, platformGameId: unknown) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = gameIdSchema.safeParse(platformGameId)
    return parsed.success ? handlers.openStorePage(parsed.data) : Promise.resolve()
  })

  ipcMain.handle(IPC.getArtworkSettings, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getArtworkSettings()
  })

  ipcMain.handle(IPC.saveSteamGridDbKey, (event, input: unknown): Promise<ArtworkKeyResult> => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = steamGridDbKeySchema.safeParse(input)
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        reason: 'invalid_input',
        message: 'That does not look like a SteamGridDB API key (letters and digits only).',
      })
    }
    return handlers.saveSteamGridDbKey(parsed.data)
  })

  ipcMain.handle(IPC.removeSteamGridDbKey, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    handlers.removeSteamGridDbKey()
  })

  ipcMain.handle(IPC.findMissingArtwork, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.findMissingArtwork()
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

  ipcMain.handle(IPC.getNotificationSettings, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.getNotificationSettings()
  })

  ipcMain.handle(IPC.updateNotificationSettings, (event, patch: unknown): NotificationSettings => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    const parsed = notificationSettingsPatchSchema.safeParse(patch)
    return handlers.updateNotificationSettings(parsed.success ? parsed.data : {})
  })

  ipcMain.handle(IPC.listDisplays, (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return handlers.listDisplays()
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
