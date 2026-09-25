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
import { eaAchievements, eaGraphql } from './api'
import { type EaToken, requestToken } from './auth'
import {
  type EaIdentity,
  parseAchievements,
  parseIdentity,
  parseLibrary,
  parseOwned,
} from './parse'

const EXPIRY_MARGIN_MS = 30 * 60_000
const OWNERSHIP =
  'PURCHASE,REDEMPTION,ENTITLEMENT_GRANT,UNKNOWN,XGP_VAULT,STEAM,STEAM_VAULT,STEAM_SUBSCRIPTION,EPIC,EPIC_VAULT,EPIC_SUBSCRIPTION'

const IDENTITY_QUERY = 'query{me{player{pd psd displayName}}}'

const OWNED_QUERY = `query{me{ownedGameProducts(storefronts:[EA,STEAM,EPIC] locale:"DEFAULT" paging:{limit:9999} productFound:true ownershipMethod:[${OWNERSHIP}] type:[DIGITAL_FULL_GAME,PACKAGED_FULL_GAME] downloadableOnly:false platforms:[PC]){items{originOfferId product{name gameSlug baseItem{gameType title keyArt{largestImage{path}}}}}}}}`

function offersQuery(offerIds: readonly string[], slugs: readonly string[]): string {
  return `query{legacyOffers(offerIds:${JSON.stringify(offerIds)},locale:"DEFAULT"){offerId:id achievementSetOverride} me{recentGames(gameSlugs:${JSON.stringify(slugs)}){items{gameSlug lastSessionEndDate}}}}`
}

interface EaSession extends EaIdentity {
  readonly token: Secret
  readonly expiresAt: Date
}

interface AccountSession {
  readonly cookies: Secret
  readonly session: EaSession | null
}

export interface EaProviderOptions {
  readonly now?: () => Date
}

export class EaProvider implements AchievementProvider {
  readonly platform = 'ea'
  readonly capabilities: ProviderCapabilities = {
    localWatch: false,
    polling: true,
    globalRarity: true,
    oauth: true,
    unofficial: true,
  }

  readonly #now: () => Date
  readonly #accounts = new Map<string, AccountSession>()
  readonly #renewing = new Map<string, Promise<EaSession>>()

  constructor({ now = () => new Date() }: EaProviderOptions = {}) {
    this.#now = now
  }

  async authenticate(input: AuthInput): Promise<AccountCredentials> {
    if (input.kind !== 'token') {
      throw new ProviderError('unsupported', 'EA: connect through the EA sign-in window')
    }
    const minted = await requestToken(input.value, this.#now())
    const session = await this.#session(minted)
    this.#accounts.set(session.accountId, { cookies: minted.cookies, session })
    return { platform: 'ea', externalId: session.accountId, secret: minted.cookies }
  }

  validate(credentials: AccountCredentials): Promise<AccountInfo> {
    const session = this.#activeSession(credentials)
    return Promise.resolve({
      externalId: session.accountId,
      displayName: session.displayName ?? 'EA account',
    })
  }

  async refresh(credentials: AccountCredentials): Promise<AccountCredentials> {
    if (this.#cachedSession(credentials) === null) await this.#renew(credentials)
    return { ...credentials, secret: this.#cookies(credentials) }
  }

  listGames(credentials: AccountCredentials, signal?: AbortSignal): Promise<readonly RemoteGame[]> {
    return this.#withSession(credentials, async (session) => {
      const owned = parseOwned(await eaGraphql(OWNED_QUERY, session.token, signal))
      if (owned.length === 0) return []
      const offerIds = owned.map((game) => game.offerId)
      const slugs = [...new Set(owned.flatMap((game) => (game.slug ? [game.slug] : [])))]
      const offers = await eaGraphql(offersQuery(offerIds, slugs), session.token, signal)
      return parseLibrary(owned, offers, this.#now())
    })
  }

  fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
    signal?: AbortSignal,
  ): Promise<RemoteGameAchievements> {
    return this.#withSession(credentials, async (session) =>
      parseAchievements(
        await eaAchievements(session.personaId, game.externalId, session.token, signal),
      ),
    )
  }

  async #session(minted: EaToken): Promise<EaSession> {
    const identity = parseIdentity(await eaGraphql(IDENTITY_QUERY, minted.token))
    return { ...identity, token: minted.token, expiresAt: minted.expiresAt }
  }

  async #withSession<T>(
    credentials: AccountCredentials,
    run: (session: EaSession) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(this.#activeSession(credentials))
    } catch (error) {
      if (!(error instanceof ProviderError) || error.kind !== 'auth_expired') throw error
      this.#dropSession(credentials)
      throw needsRenewing(error)
    }
  }

  #activeSession(credentials: AccountCredentials): EaSession {
    const session = this.#cachedSession(credentials)
    if (session === null) throw needsRenewing()
    return session
  }

  #cachedSession(credentials: AccountCredentials): EaSession | null {
    const session = this.#accounts.get(credentials.externalId)?.session ?? null
    if (!session) return null
    return session.expiresAt.getTime() - this.#now().getTime() > EXPIRY_MARGIN_MS ? session : null
  }

  #renew(credentials: AccountCredentials): Promise<EaSession> {
    const pending = this.#renewing.get(credentials.externalId)
    if (pending) return pending

    const renewing = this.#rotate(credentials).finally(() =>
      this.#renewing.delete(credentials.externalId),
    )
    this.#renewing.set(credentials.externalId, renewing)
    return renewing
  }

  async #rotate(credentials: AccountCredentials): Promise<EaSession> {
    const minted = await requestToken(this.#cookies(credentials), this.#now())
    this.#accounts.set(credentials.externalId, { cookies: minted.cookies, session: null })
    const session = await this.#session(minted)
    if (session.accountId !== credentials.externalId) {
      throw new ProviderError('other', 'EA: the saved sign-in belongs to a different account')
    }
    this.#accounts.set(credentials.externalId, { cookies: minted.cookies, session })
    return session
  }

  #cookies(credentials: AccountCredentials): Secret {
    const latest = this.#accounts.get(credentials.externalId)?.cookies
    if (latest) return latest
    if (credentials.secret === null) {
      throw new ProviderError('auth_expired', 'EA: no sign-in is stored for this account')
    }
    return credentials.secret
  }

  #dropSession(credentials: AccountCredentials): void {
    const entry = this.#accounts.get(credentials.externalId)
    if (entry) this.#accounts.set(credentials.externalId, { ...entry, session: null })
  }
}

function needsRenewing(cause?: unknown): ProviderError {
  return new ProviderError('network', 'EA: the token needs renewing; retrying shortly', { cause })
}
