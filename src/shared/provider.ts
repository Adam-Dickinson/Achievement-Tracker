import type {
  AccountCredentials,
  AccountInfo,
  RemoteGame,
  RemoteGameAchievements,
  RemoteGameRef,
} from './models'
import type { Platform } from './platform'
import type { Secret } from './secret'

/** What the UI and sync engine may assume about a provider. */
export interface ProviderCapabilities {
  /** Can push change notifications from local files (no polling needed). */
  readonly localWatch: boolean
  /** Must be polled on a schedule. */
  readonly polling: boolean
  /** Supplies global rarity percentages. */
  readonly globalRarity: boolean
  /** Sign-in happens through an OAuth-style web flow. */
  readonly oauth: boolean
  /** Relies on unofficial endpoints; must be opt-in and labelled. */
  readonly unofficial: boolean
}

/** User-supplied input for connecting an account. */
export type AuthInput =
  | { readonly kind: 'api_key'; readonly key: Secret; readonly accountId: string }
  | { readonly kind: 'token'; readonly value: Secret }
  | { readonly kind: 'oauth_callback'; readonly redirectUrl: string }
  | { readonly kind: 'local_path'; readonly path: string }

/**
 * A platform adapter. Pure: no SQL, no notifications, no UI (docs/ARCHITECTURE.md §2).
 * Failures are reported by throwing `ProviderError`. Every call accepts an `AbortSignal` so
 * it can be cancelled (on disconnect, or on quit).
 */
export interface AchievementProvider {
  readonly platform: Platform
  readonly capabilities: ProviderCapabilities

  authenticate(input: AuthInput, signal?: AbortSignal): Promise<AccountCredentials>

  /** Check the credentials are still valid and return the account identity. */
  validate(credentials: AccountCredentials, signal?: AbortSignal): Promise<AccountInfo>

  /** All games with achievement data for this account. */
  listGames(credentials: AccountCredentials, signal?: AbortSignal): Promise<readonly RemoteGame[]>

  /** Full schema and unlock state for one game. */
  fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
    signal?: AbortSignal,
  ): Promise<RemoteGameAchievements>

  /**
   * Event-driven sources implement this and return a function that stops watching; polled
   * sources leave it out. The callback only signals "something changed for this game": the sync
   * engine re-fetches and diffs. Watchers never emit unlocks themselves.
   */
  watch?(credentials: AccountCredentials, onChange: (game: RemoteGameRef) => void): () => void
}
