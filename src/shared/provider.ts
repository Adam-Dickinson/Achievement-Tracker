import type {
  AccountCredentials,
  AccountInfo,
  RemoteGame,
  RemoteGameAchievements,
  RemoteGameRef,
} from './models'
import type { Platform } from './platform'
import type { Secret } from './secret'

export interface ProviderCapabilities {
  readonly localWatch: boolean
  readonly polling: boolean
  readonly globalRarity: boolean
  readonly oauth: boolean
  readonly unofficial: boolean
}

export type AuthInput =
  | { readonly kind: 'api_key'; readonly key: Secret; readonly accountId: string }
  | { readonly kind: 'token'; readonly value: Secret }
  | { readonly kind: 'oauth_callback'; readonly redirectUrl: string }
  | { readonly kind: 'local_path'; readonly path: string }

export interface AchievementProvider {
  readonly platform: Platform
  readonly capabilities: ProviderCapabilities

  authenticate(input: AuthInput, signal?: AbortSignal): Promise<AccountCredentials>

  validate(credentials: AccountCredentials, signal?: AbortSignal): Promise<AccountInfo>

  listGames(credentials: AccountCredentials, signal?: AbortSignal): Promise<readonly RemoteGame[]>

  fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
    signal?: AbortSignal,
  ): Promise<RemoteGameAchievements>

  watch?(credentials: AccountCredentials, onChange: (game: RemoteGameRef) => void): () => void
}
