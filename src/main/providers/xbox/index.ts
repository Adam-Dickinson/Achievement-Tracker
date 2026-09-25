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
import { xblGet } from './api'
import { exchangeCode, refreshTokens, type XboxSession, xboxUserToken, xstsSession } from './auth'
import {
  parseAchievementsPage,
  parseTitleHistory,
  toGameAchievements,
  type XboxAchievement,
} from './parse'

const TITLEHUB = 'https://titlehub.xboxlive.com'
const ACHIEVEMENTS = 'https://achievements.xboxlive.com'
const TITLEHUB_CONTRACT = 2
const ACHIEVEMENTS_CONTRACT = 4
const PAGE_SIZE = 1000
const MAX_PAGES = 20
const EXPIRY_MARGIN_MS = 5 * 60_000

interface AccountSession {
  readonly refreshToken: Secret
  readonly session: XboxSession | null
}

export interface XboxProviderOptions {
  readonly now?: () => Date
}

export class XboxProvider implements AchievementProvider {
  readonly platform = 'xbox'
  readonly capabilities: ProviderCapabilities = {
    localWatch: false,
    polling: true,
    globalRarity: true,
    oauth: true,
    unofficial: true,
  }

  readonly #now: () => Date
  readonly #accounts = new Map<string, AccountSession>()

  constructor({ now = () => new Date() }: XboxProviderOptions = {}) {
    this.#now = now
  }

  async authenticate(input: AuthInput, signal?: AbortSignal): Promise<AccountCredentials> {
    if (input.kind !== 'oauth_code') {
      throw new ProviderError('unsupported', 'Xbox: connect by signing in with Microsoft')
    }
    const tokens = await exchangeCode(input.code, input.redirectUri, input.codeVerifier, signal)
    const user = await xboxUserToken(tokens.accessToken, signal)
    const session = await xstsSession(user.token, signal)
    this.#accounts.set(session.xuid, { refreshToken: tokens.refreshToken, session })
    return { platform: 'xbox', externalId: session.xuid, secret: tokens.refreshToken }
  }

  async validate(credentials: AccountCredentials, signal?: AbortSignal): Promise<AccountInfo> {
    const session = await this.#session(credentials, signal)
    return { externalId: session.xuid, displayName: session.gamertag }
  }

  async refresh(
    credentials: AccountCredentials,
    signal?: AbortSignal,
  ): Promise<AccountCredentials> {
    await this.#session(credentials, signal)
    return { ...credentials, secret: this.#refreshToken(credentials) }
  }

  listGames(credentials: AccountCredentials, signal?: AbortSignal): Promise<readonly RemoteGame[]> {
    return this.#withSession(credentials, signal, async (session) => {
      const json = await xblGet(
        `${TITLEHUB}/users/xuid(${session.xuid})/titles/titlehistory/decoration/achievement,image`,
        { auth: session.authorization, contractVersion: TITLEHUB_CONTRACT, signal },
      )
      return parseTitleHistory(json, this.#now())
    })
  }

  fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
    signal?: AbortSignal,
  ): Promise<RemoteGameAchievements> {
    return this.#withSession(credentials, signal, async (session) => {
      const list: XboxAchievement[] = []
      let continuationToken: string | null = null
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(`${ACHIEVEMENTS}/users/xuid(${session.xuid})/achievements`)
        url.searchParams.set('titleId', game.externalId)
        url.searchParams.set('maxItems', String(PAGE_SIZE))
        if (continuationToken !== null) url.searchParams.set('continuationToken', continuationToken)

        const json = await xblGet(url.toString(), {
          auth: session.authorization,
          contractVersion: ACHIEVEMENTS_CONTRACT,
          signal,
        })
        const parsed = parseAchievementsPage(json)
        list.push(...parsed.achievements)
        continuationToken = parsed.continuationToken
        if (continuationToken === null) return toGameAchievements(list)
      }
      throw new ProviderError('parse', `Xbox: more than ${MAX_PAGES} pages of achievements`)
    })
  }

  async #withSession<T>(
    credentials: AccountCredentials,
    signal: AbortSignal | undefined,
    run: (session: XboxSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.#session(credentials, signal)
    try {
      return await run(session)
    } catch (error) {
      if (!(error instanceof ProviderError) || error.kind !== 'auth_expired') throw error
      this.#dropSession(credentials)
      return run(await this.#session(credentials, signal))
    }
  }

  async #session(credentials: AccountCredentials, signal?: AbortSignal): Promise<XboxSession> {
    const cached = this.#accounts.get(credentials.externalId)?.session
    if (cached && cached.expiresAt.getTime() - this.#now().getTime() > EXPIRY_MARGIN_MS) {
      return cached
    }

    const tokens = await refreshTokens(this.#refreshToken(credentials), signal)
    this.#accounts.set(credentials.externalId, { refreshToken: tokens.refreshToken, session: null })
    const user = await xboxUserToken(tokens.accessToken, signal)
    const session = await xstsSession(user.token, signal)
    if (session.xuid !== credentials.externalId) {
      throw new ProviderError('other', 'Xbox: the saved sign-in belongs to a different account')
    }
    this.#accounts.set(credentials.externalId, { refreshToken: tokens.refreshToken, session })
    return session
  }

  #refreshToken(credentials: AccountCredentials): Secret {
    const latest = this.#accounts.get(credentials.externalId)?.refreshToken
    if (latest) return latest
    if (credentials.secret === null) {
      throw new ProviderError('auth_expired', 'Xbox: no sign-in is stored for this account')
    }
    return credentials.secret
  }

  #dropSession(credentials: AccountCredentials): void {
    const entry = this.#accounts.get(credentials.externalId)
    if (entry) this.#accounts.set(credentials.externalId, { ...entry, session: null })
  }
}
