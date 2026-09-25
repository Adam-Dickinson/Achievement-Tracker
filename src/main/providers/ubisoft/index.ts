import { ProviderError } from '@shared/errors'
import type {
  AccountCredentials,
  AccountInfo,
  RemoteGame,
  RemoteGameAchievements,
  RemoteGameRef,
} from '@shared/models'
import type { AchievementProvider, AuthInput, ProviderCapabilities } from '@shared/provider'
import type { Secret } from '@shared/secret'
import { ubisoftGraphql } from './api'
import { refreshSession, type UbisoftSession } from './auth'
import { parseAchievements, parseLibrary } from './parse'

const EXPIRY_MARGIN_MS = 30 * 60_000

const GAMES_QUERY = `query UbisoftGames {
  viewer {
    id
    name
    games(filterBy: { isOwned: true }) {
      nodes {
        id spaceId name avatarUrl backgroundUrl
        viewer { meta { id lastPlayedDate achievements { totalCount completedCount } } }
      }
    }
  }
}`

const ACHIEVEMENTS_QUERY = `query UbisoftAchievements($spaceId: String!) {
  game(spaceId: $spaceId) {
    id
    viewer {
      meta {
        id
        achievements {
          totalCount
          nodes {
            id title description icon
            viewer { meta { id completionDate isCompleted } }
          }
        }
      }
    }
  }
}`

interface AccountSession {
  readonly rememberMeTicket: Secret
  readonly session: UbisoftSession | null
}

export interface UbisoftProviderOptions {
  readonly now?: () => Date
}

export class UbisoftProvider implements AchievementProvider {
  readonly platform = 'ubisoft'
  readonly capabilities: ProviderCapabilities = {
    localWatch: false,
    polling: true,
    globalRarity: false,
    oauth: true,
    unofficial: true,
  }

  readonly #now: () => Date
  readonly #accounts = new Map<string, AccountSession>()
  readonly #renewing = new Map<string, Promise<UbisoftSession>>()

  constructor({ now = () => new Date() }: UbisoftProviderOptions = {}) {
    this.#now = now
  }

  async authenticate(input: AuthInput): Promise<AccountCredentials> {
    if (input.kind !== 'token') {
      throw new ProviderError('unsupported', 'Ubisoft: connect through the Ubisoft sign-in window')
    }
    const session = await refreshSession(input.value, this.#now())
    this.#accounts.set(session.userId, { rememberMeTicket: session.rememberMeTicket, session })
    return { platform: 'ubisoft', externalId: session.userId, secret: session.rememberMeTicket }
  }

  validate(credentials: AccountCredentials): Promise<AccountInfo> {
    const session = this.#activeSession(credentials)
    return Promise.resolve({
      externalId: session.userId,
      displayName: session.displayName ?? 'Ubisoft account',
    })
  }

  async refresh(credentials: AccountCredentials): Promise<AccountCredentials> {
    if (this.#cachedSession(credentials) === null) await this.#renew(credentials)
    return { ...credentials, secret: this.#rememberMeTicket(credentials) }
  }

  listGames(credentials: AccountCredentials, signal?: AbortSignal): Promise<readonly RemoteGame[]> {
    return this.#withSession(credentials, async (session) => {
      const data = await ubisoftGraphql(GAMES_QUERY, {}, session, signal)
      return parseLibrary(data, this.#now()).games
    })
  }

  fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
    signal?: AbortSignal,
  ): Promise<RemoteGameAchievements> {
    return this.#withSession(credentials, async (session) => {
      const data = await ubisoftGraphql(
        ACHIEVEMENTS_QUERY,
        { spaceId: game.externalId },
        session,
        signal,
      )
      return parseAchievements(data)
    })
  }

  async #withSession<T>(
    credentials: AccountCredentials,
    run: (session: UbisoftSession) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(this.#activeSession(credentials))
    } catch (error) {
      if (!(error instanceof ProviderError) || error.kind !== 'auth_expired') throw error
      this.#dropSession(credentials)
      throw needsRenewing(error)
    }
  }

  #activeSession(credentials: AccountCredentials): UbisoftSession {
    const session = this.#cachedSession(credentials)
    if (session === null) throw needsRenewing()
    return session
  }

  #cachedSession(credentials: AccountCredentials): UbisoftSession | null {
    const session = this.#accounts.get(credentials.externalId)?.session ?? null
    if (!session) return null
    return session.expiresAt.getTime() - this.#now().getTime() > EXPIRY_MARGIN_MS ? session : null
  }

  #renew(credentials: AccountCredentials): Promise<UbisoftSession> {
    const pending = this.#renewing.get(credentials.externalId)
    if (pending) return pending

    const renewing = this.#rotate(credentials).finally(() =>
      this.#renewing.delete(credentials.externalId),
    )
    this.#renewing.set(credentials.externalId, renewing)
    return renewing
  }

  async #rotate(credentials: AccountCredentials): Promise<UbisoftSession> {
    const session = await refreshSession(this.#rememberMeTicket(credentials), this.#now())
    if (session.userId !== credentials.externalId) {
      throw new ProviderError('other', 'Ubisoft: the saved sign-in belongs to a different account')
    }
    this.#accounts.set(credentials.externalId, {
      rememberMeTicket: session.rememberMeTicket,
      session,
    })
    return session
  }

  #rememberMeTicket(credentials: AccountCredentials): Secret {
    const latest = this.#accounts.get(credentials.externalId)?.rememberMeTicket
    if (latest) return latest
    if (credentials.secret === null) {
      throw new ProviderError('auth_expired', 'Ubisoft: no sign-in is stored for this account')
    }
    return credentials.secret
  }

  #dropSession(credentials: AccountCredentials): void {
    const entry = this.#accounts.get(credentials.externalId)
    if (entry) this.#accounts.set(credentials.externalId, { ...entry, session: null })
  }
}

function needsRenewing(cause?: unknown): ProviderError {
  return new ProviderError('network', 'Ubisoft: the session needs renewing; retrying shortly', {
    cause,
  })
}
