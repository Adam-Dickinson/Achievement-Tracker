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
  connectSteam: 'accounts:connect-steam',
  connectXbox: 'accounts:connect-xbox',
  cancelXboxSignIn: 'accounts:cancel-xbox-sign-in',
  openEpicSignIn: 'accounts:open-epic-sign-in',
  connectEpic: 'accounts:connect-epic',
  connectUbisoft: 'accounts:connect-ubisoft',
  cancelUbisoftSignIn: 'accounts:cancel-ubisoft-sign-in',
  listLibrary: 'library:list',
  getGame: 'library:get-game',
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

export interface EpicConnectInput {
  readonly code: string
  readonly acceptedUnofficial: true
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
  connectSteam(input: SteamConnectInput): Promise<ConnectResult>
  connectXbox(input: XboxConnectInput): Promise<ConnectResult>
  cancelXboxSignIn(): Promise<void>
  openEpicSignIn(): Promise<void>
  connectEpic(input: EpicConnectInput): Promise<ConnectResult>
  connectUbisoft(input: UbisoftConnectInput): Promise<ConnectResult>
  cancelUbisoftSignIn(): Promise<void>
  listLibrary(): Promise<LibraryGame[]>
  getGame(id: number): Promise<GameDetail | null>
  getDashboard(): Promise<DashboardStats>
  listActivity(limit: number): Promise<ActivityPage>
  onDataChanged(listener: () => void): () => void
  onToasts(listener: (toasts: readonly VisibleToast[]) => void): () => void
}
