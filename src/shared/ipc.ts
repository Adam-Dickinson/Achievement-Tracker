import type { DashboardStats } from './dashboard'
import type { ActivityPage, GameDetail, LibraryGame } from './library'
import type { AccountStatus } from './models'
import type { Platform } from './platform'
import type { Rarity } from './rarity'

export const IPC = {
  getAppInfo: 'app:get-info',
  sendTestNotification: 'notifications:send-test',
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
  listLibrary: 'library:list',
  getGame: 'library:get-game',
  mergeGames: 'library:merge-games',
  unlinkGame: 'library:unlink-game',
  getArtworkSettings: 'artwork:get-settings',
  saveSteamGridDbKey: 'artwork:save-steamgriddb-key',
  removeSteamGridDbKey: 'artwork:remove-steamgriddb-key',
  findMissingArtwork: 'artwork:find-missing',
  getDashboard: 'dashboard:get',
  listActivity: 'activity:list',
  dataChanged: 'data:changed',
} as const

export interface AppInfo {
  readonly version: string
  readonly schemaVersion: number
}

export interface ToastPayload {
  readonly heading: string
  readonly rarity: Rarity
  readonly title: string
  readonly description: string | null
  readonly game: string
  readonly platform: string
  readonly percent: number | null
  readonly platinum: boolean
}

export interface VisibleToast extends ToastPayload {
  readonly id: number
}

export interface AccountSummary {
  readonly id: number
  readonly platform: Platform
  readonly displayName: string
  readonly status: AccountStatus
  readonly gameCount: number
  readonly checkedGames: number
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
  listLibrary(): Promise<LibraryGame[]>
  getGame(id: number): Promise<GameDetail | null>
  mergeGames(input: MergeGamesInput): Promise<void>
  unlinkGame(input: UnlinkGameInput): Promise<void>
  getArtworkSettings(): Promise<ArtworkSettings>
  saveSteamGridDbKey(input: SteamGridDbKeyInput): Promise<ArtworkKeyResult>
  removeSteamGridDbKey(): Promise<void>
  findMissingArtwork(): Promise<ArtworkRun>
  getDashboard(): Promise<DashboardStats>
  listActivity(limit: number): Promise<ActivityPage>
  onDataChanged(listener: () => void): () => void
  onToasts(listener: (toasts: readonly VisibleToast[]) => void): () => void
}
