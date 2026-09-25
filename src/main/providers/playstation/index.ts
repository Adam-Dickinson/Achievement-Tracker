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
import {
  fetchEarnedTrophies,
  fetchProfile,
  fetchTitleTrophies,
  fetchTrophySummary,
  fetchTrophyTitles,
} from './api'
import { mintTokens, type PsnTokens, renewTokens } from './auth'
import {
  parseAccountId,
  parseGameExternalId,
  parseLibrary,
  parseOnlineId,
  parseTrophies,
} from './parse'

const ACCESS_MARGIN_MS = 10 * 60_000
const REFRESH_MARGIN_MS = 24 * 60 * 60_000

interface Identity {
  readonly accountId: string
  readonly onlineId: string | null
}

interface AccountSession {
  readonly tokens: PsnTokens
  readonly identity: Identity
  readonly accessValid: boolean
}

export interface PlayStationProviderOptions {
  readonly now?: () => Date
}

export class PlayStationProvider implements AchievementProvider {
  readonly platform = 'playstation'
  readonly capabilities: ProviderCapabilities = {
    localWatch: false,
    polling: true,
    globalRarity: true,
    oauth: true,
    unofficial: true,
  }

  readonly #now: () => Date
  readonly #sessions = new Map<string, AccountSession>()
  readonly #renewing = new Map<string, Promise<AccountSession>>()

  constructor({ now = () => new Date() }: PlayStationProviderOptions = {}) {
    this.#now = now
  }

  async authenticate(input: AuthInput): Promise<AccountCredentials> {
    if (input.kind !== 'token') {
      throw new ProviderError(
        'unsupported',
        'PlayStation: connect through the PlayStation sign-in window',
      )
    }
    const tokens = await mintTokens(input.value, this.#now())
    const identity = await identify(tokens.accessToken)
    this.#sessions.set(identity.accountId, { tokens, identity, accessValid: true })
    return { platform: 'playstation', externalId: identity.accountId, secret: input.value }
  }

  validate(credentials: AccountCredentials): Promise<AccountInfo> {
    const { identity } = this.#activeSession(credentials)
    return Promise.resolve({
      externalId: identity.accountId,
      displayName: identity.onlineId ?? 'PlayStation account',
    })
  }

  async refresh(
    credentials: AccountCredentials,
    signal?: AbortSignal,
  ): Promise<AccountCredentials> {
    if (this.#usableSession(credentials) === null) await this.#renew(credentials, signal)
    return credentials
  }

  listGames(credentials: AccountCredentials, signal?: AbortSignal): Promise<readonly RemoteGame[]> {
    return this.#withSession(credentials, async (token) =>
      parseLibrary(await fetchTrophyTitles(token, signal), this.#now()),
    )
  }

  async fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
    signal?: AbortSignal,
  ): Promise<RemoteGameAchievements> {
    const set = parseGameExternalId(game.externalId)
    return await this.#withSession(credentials, async (token) => {
      const defined = await fetchTitleTrophies(set, token, signal)
      const earned = await fetchEarnedTrophies(set, token, signal)
      return parseTrophies(defined, earned)
    })
  }

  async #withSession<T>(
    credentials: AccountCredentials,
    run: (token: Secret) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(this.#activeSession(credentials).tokens.accessToken)
    } catch (error) {
      if (!(error instanceof ProviderError) || error.kind !== 'auth_expired') throw error
      this.#dropAccessToken(credentials)
      throw needsRenewing(error)
    }
  }

  #activeSession(credentials: AccountCredentials): AccountSession {
    const session = this.#usableSession(credentials)
    if (session === null) throw needsRenewing()
    return session
  }

  #usableSession(credentials: AccountCredentials): AccountSession | null {
    const session = this.#sessions.get(credentials.externalId)
    if (!session?.accessValid) return null
    const left = session.tokens.accessExpiresAt.getTime() - this.#now().getTime()
    return left > ACCESS_MARGIN_MS ? session : null
  }

  #renew(credentials: AccountCredentials, signal?: AbortSignal): Promise<AccountSession> {
    const pending = this.#renewing.get(credentials.externalId)
    if (pending) return pending

    const renewing = this.#renewNow(credentials, signal).finally(() =>
      this.#renewing.delete(credentials.externalId),
    )
    this.#renewing.set(credentials.externalId, renewing)
    return renewing
  }

  async #renewNow(credentials: AccountCredentials, signal?: AbortSignal): Promise<AccountSession> {
    const previous = this.#sessions.get(credentials.externalId)
    if (previous && this.#refreshTokenLasts(previous.tokens)) {
      try {
        const tokens = await renewTokens(previous.tokens.refreshToken, this.#now(), signal)
        return this.#keep(credentials, { tokens, identity: previous.identity, accessValid: true })
      } catch (error) {
        if (!(error instanceof ProviderError) || error.kind !== 'auth_expired') throw error
      }
    }

    const tokens = await mintTokens(this.#npsso(credentials), this.#now(), signal)
    const identity = await identify(tokens.accessToken, signal)
    if (identity.accountId !== credentials.externalId) {
      throw new ProviderError(
        'other',
        'PlayStation: the saved sign-in belongs to a different account',
      )
    }
    return this.#keep(credentials, { tokens, identity, accessValid: true })
  }

  #keep(credentials: AccountCredentials, session: AccountSession): AccountSession {
    this.#sessions.set(credentials.externalId, session)
    return session
  }

  #refreshTokenLasts(tokens: PsnTokens): boolean {
    return tokens.refreshExpiresAt.getTime() - this.#now().getTime() > REFRESH_MARGIN_MS
  }

  #npsso(credentials: AccountCredentials): Secret {
    if (credentials.secret === null) {
      throw new ProviderError('auth_expired', 'PlayStation: no sign-in is stored for this account')
    }
    return credentials.secret
  }

  #dropAccessToken(credentials: AccountCredentials): void {
    const session = this.#sessions.get(credentials.externalId)
    if (session) this.#sessions.set(credentials.externalId, { ...session, accessValid: false })
  }
}

async function identify(token: Secret, signal?: AbortSignal): Promise<Identity> {
  const accountId = parseAccountId(await fetchTrophySummary(token, signal))
  const onlineId = parseOnlineId(await fetchProfile(accountId, token, signal))
  return { accountId, onlineId }
}

function needsRenewing(cause?: unknown): ProviderError {
  return new ProviderError('network', 'PlayStation: the token needs renewing; retrying shortly', {
    cause,
  })
}
