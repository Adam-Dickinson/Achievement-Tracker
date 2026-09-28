import type { DashboardStats } from './dashboard'
import type { ActivityPage, GameDetail, LibraryGame } from './library'
import type { AccountStatus } from './models'
import { PLATFORMS, type Platform } from './platform'
import type { Rarity } from './rarity'

export const IPC = {
  getAppInfo: 'app:get-info',
  sendTestNotification: 'notifications:send-test',
  getProfile: 'profile:get',
  setProfileName: 'profile:set-name',
  getNotificationsPaused: 'notifications:get-paused',
  setNotificationsPaused: 'notifications:set-paused',
  notificationsPausedChanged: 'notifications:paused-changed',
  setToasts: 'overlay:set-toasts',
  listAccounts: 'accounts:list',
  disconnectAccount: 'accounts:disconnect',
  syncNow: 'sync:now',
  connectSteam: 'accounts:connect-steam',
  connectXbox: 'accounts:connect-xbox',
  cancelXboxSignIn: 'accounts:cancel-xbox-sign-in',
  openEpicSignIn: 'accounts:open-epic-sign-in',
  connectEpic: 'accounts:connect-epic',
  connectUbisoft: 'accounts:connect-ubisoft',
  cancelUbisoftSignIn: 'accounts:cancel-ubisoft-sign-in',
  connectEa: 'accounts:connect-ea',
  cancelEaSignIn: 'accounts:cancel-ea-sign-in',
  connectPlayStation: 'accounts:connect-playstation',
  cancelPlayStationSignIn: 'accounts:cancel-playstation-sign-in',
  signInToSteam: 'accounts:sign-in-to-steam',
  cancelSteamSignIn: 'accounts:cancel-steam-sign-in',
  findShadPs4: 'accounts:find-shadps4',
  chooseShadPs4Folder: 'accounts:choose-shadps4-folder',
  connectShadPs4: 'accounts:connect-shadps4',
  listLibrary: 'library:list',
  getGame: 'library:get-game',
  mergeGames: 'library:merge-games',
  unlinkGame: 'library:unlink-game',
  openStorePage: 'library:open-store-page',
  getArtworkSettings: 'artwork:get-settings',
  saveSteamGridDbKey: 'artwork:save-steamgriddb-key',
  removeSteamGridDbKey: 'artwork:remove-steamgriddb-key',
  findMissingArtwork: 'artwork:find-missing',
  getDashboard: 'dashboard:get',
  listActivity: 'activity:list',
  getNotificationSettings: 'notifications:get-settings',
  updateNotificationSettings: 'notifications:update-settings',
  notificationSettingsChanged: 'notifications:settings-changed',
  listDisplays: 'overlay:list-displays',
  dataChanged: 'data:changed',
} as const

export interface AppInfo {
  readonly version: string
  readonly schemaVersion: number
}

export interface Profile {
  readonly name: string | null
  readonly windowsName: string
}

export const MAX_PROFILE_NAME = 40

export interface ToastPayload {
  readonly heading: string
  readonly rarity: Rarity
  readonly title: string
  readonly description: string | null
  readonly game: string
  readonly platform: Platform | null
  readonly percent: number | null
  readonly platinum: boolean
}

export interface VisibleToast extends ToastPayload {
  readonly id: number
}

export const TOAST_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type ToastCorner = (typeof TOAST_CORNERS)[number]

export const TOAST_SIZES = ['small', 'medium', 'large'] as const
export type ToastSize = (typeof TOAST_SIZES)[number]

export const TOAST_SCALE: Readonly<Record<ToastSize, number>> = {
  small: 0.85,
  medium: 1,
  large: 1.15,
}

export interface NotificationSettings {
  readonly corner: ToastCorner
  readonly monitor: 'primary' | number
  readonly size: ToastSize
  readonly durationSec: number
  readonly minRarity: Rarity
  readonly enabledPlatforms: Readonly<Record<Platform, boolean>>
  readonly sound: {
    readonly enabled: boolean
    readonly volume: number
  }
}

export interface NotificationSettingsPatch {
  readonly corner?: ToastCorner
  readonly monitor?: 'primary' | number
  readonly size?: ToastSize
  readonly durationSec?: number
  readonly minRarity?: Rarity
  readonly enabledPlatforms?: Partial<Record<Platform, boolean>>
  readonly sound?: {
    readonly enabled?: boolean
    readonly volume?: number
  }
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  corner: 'bottom-right',
  monitor: 'primary',
  size: 'medium',
  durationSec: 5,
  minRarity: 'common',
  enabledPlatforms: Object.fromEntries(PLATFORMS.map((platform) => [platform, true])) as Record<
    Platform,
    boolean
  >,
  sound: { enabled: true, volume: 0.6 },
}

export interface DisplayInfo {
  readonly id: number
  readonly label: string
  readonly primary: boolean
}

export interface OverlayFrame {
  readonly toasts: readonly VisibleToast[]
  readonly corner: ToastCorner
  readonly scale: number
  readonly sound: { readonly enabled: boolean; readonly volume: number }
}

export interface AccountSummary {
  readonly id: number
  readonly platform: Platform
  readonly displayName: string
  readonly status: AccountStatus
  readonly gameCount: number
  readonly checkedGames: number
  readonly unlockedCount: number
  readonly lastSyncAt: Date | null
  readonly syncing: boolean
}

export type SyncScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'account'; readonly accountId: number }
  | { readonly kind: 'game'; readonly gameId: number }

export interface DisconnectInput {
  readonly accountId: number
  readonly keepData: boolean
}

export interface SteamConnectInput {
  readonly steamId: string
  readonly apiKey: string
}

export interface XboxConnectInput {
  readonly acceptedUnofficial: true
}

export interface UbisoftConnectInput {
  readonly acceptedUnofficial: true
}

export interface SteamSignInInput {
  readonly includeFamily: boolean
  readonly acceptedUnofficial: true
}

export interface EaConnectInput {
  readonly acceptedUnofficial: true
}

export interface PlayStationConnectInput {
  readonly acceptedUnofficial: true
}

export interface EpicConnectInput {
  readonly code: string
  readonly acceptedUnofficial: true
}

export interface EmulatorUser {
  readonly id: string
  readonly name: string
  readonly games: number
  readonly unlocked: number
}

export interface EmulatorFolder {
  readonly path: string
  readonly users: readonly EmulatorUser[]
}

export type ChooseEmulatorFolderResult =
  | { readonly kind: 'chosen'; readonly folder: EmulatorFolder }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'not_found'; readonly path: string }

export interface EmulatorConnectInput {
  readonly path: string
  readonly userId: string
}

export interface MergeGamesInput {
  readonly intoGameId: number
  readonly gameId: number
}

export interface UnlinkGameInput {
  readonly platformGameId: number
}

export type ArtworkProblem = 'key_refused' | 'unreachable' | null

export interface ArtworkSettings {
  readonly hasKey: boolean
  readonly missing: number
  readonly problem: ArtworkProblem
}

export interface ArtworkRun {
  readonly found: number
  readonly checked: number
}

export interface SteamGridDbKeyInput {
  readonly key: string
}

export type ArtworkKeyResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: 'invalid_input' | 'key_rejected' | 'network' | 'other'
      readonly message: string
    }

export type ConnectFailure =
  'invalid_input' | 'key_rejected' | 'code_rejected' | 'cancelled' | 'network' | 'other'

export type ConnectResult =
  | { readonly ok: true; readonly account: AccountSummary }
  | { readonly ok: false; readonly reason: ConnectFailure; readonly message: string }

export interface TrophyLockerApi {
  getAppInfo(): Promise<AppInfo>
  sendTestNotification(): Promise<void>
  getProfile(): Promise<Profile>
  setProfileName(name: string): Promise<Profile>
  getNotificationsPaused(): Promise<boolean>
  setNotificationsPaused(paused: boolean): Promise<void>
  listAccounts(): Promise<AccountSummary[]>
  disconnectAccount(input: DisconnectInput): Promise<void>
  syncNow(scope: SyncScope): Promise<void>
  connectSteam(input: SteamConnectInput): Promise<ConnectResult>
  connectXbox(input: XboxConnectInput): Promise<ConnectResult>
  cancelXboxSignIn(): Promise<void>
  openEpicSignIn(): Promise<void>
  connectEpic(input: EpicConnectInput): Promise<ConnectResult>
  connectUbisoft(input: UbisoftConnectInput): Promise<ConnectResult>
  cancelUbisoftSignIn(): Promise<void>
  connectEa(input: EaConnectInput): Promise<ConnectResult>
  cancelEaSignIn(): Promise<void>
  connectPlayStation(input: PlayStationConnectInput): Promise<ConnectResult>
  cancelPlayStationSignIn(): Promise<void>
  signInToSteam(input: SteamSignInInput): Promise<ConnectResult>
  cancelSteamSignIn(): Promise<void>
  findShadPs4(): Promise<EmulatorFolder | null>
  chooseShadPs4Folder(): Promise<ChooseEmulatorFolderResult>
  connectShadPs4(input: EmulatorConnectInput): Promise<ConnectResult>
  listLibrary(): Promise<LibraryGame[]>
  getGame(id: number): Promise<GameDetail | null>
  mergeGames(input: MergeGamesInput): Promise<void>
  unlinkGame(input: UnlinkGameInput): Promise<void>
  openStorePage(platformGameId: number): Promise<void>
  getArtworkSettings(): Promise<ArtworkSettings>
  saveSteamGridDbKey(input: SteamGridDbKeyInput): Promise<ArtworkKeyResult>
  removeSteamGridDbKey(): Promise<void>
  findMissingArtwork(): Promise<ArtworkRun>
  getDashboard(): Promise<DashboardStats>
  listActivity(limit: number): Promise<ActivityPage>
  getNotificationSettings(): Promise<NotificationSettings>
  updateNotificationSettings(patch: NotificationSettingsPatch): Promise<NotificationSettings>
  listDisplays(): Promise<DisplayInfo[]>
  onDataChanged(listener: () => void): () => void
  onToasts(listener: (frame: OverlayFrame) => void): () => void
  onNotificationsPausedChanged(listener: (paused: boolean) => void): () => void
  onNotificationSettingsChanged(listener: (settings: NotificationSettings) => void): () => void
}
