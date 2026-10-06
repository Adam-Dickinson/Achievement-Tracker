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
import { epicGet, epicGraphql } from './api'
import { type EpicSession, exchangeCode, refreshSession } from './auth'
import {
  type EpicCatalogDetails,
  type EpicLibraryRecord,
  NO_CATALOG,
  parseAchievementCount,
  parseAchievements,
  parseCatalog,
  parseLibraryPage,
  parsePlayerUnlocks,
  parsePlaytime,
  toGameAchievements,
} from './parse'

const LIBRARY = 'https://library-service.live.use1a.on.epicgames.com/library/api/public'
const CATALOG =
  'https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace'
const COUNTRY = 'GB'
const LOCALE = 'en-GB'
const ACHIEVEMENT_LOCALE = 'en-US'
const MAX_LIBRARY_PAGES = 50
const EXPIRY_MARGIN_MS = 30 * 60_000
const DETAILS_TTL_MS = 24 * 60 * 60_000

const COUNT_QUERY = `query Achievement($SandboxId: String!, $Locale: String!) {
  Achievement {
    productAchievementsRecordBySandbox(sandboxId: $SandboxId, locale: $Locale) {
      totalAchievements
    }
  }
}`

const ACHIEVEMENTS_QUERY = `query Achievement($SandboxId: String!, $Locale: String!) {
  Achievement {
    productAchievementsRecordBySandbox(sandboxId: $SandboxId, locale: $Locale) {
      totalAchievements
      achievements {
        achievement {
          name hidden
          unlockedDisplayName lockedDisplayName unlockedDescription lockedDescription
          unlockedIconLink lockedIconLink XP
          tier { name }
          rarity { percent }
        }
      }
    }
  }
}`

const PLAYER_QUERY = `query PlayerAchievement($epicAccountId: String!, $sandboxId: String!) {
  PlayerAchievement {
    playerAchievementGameRecordsBySandbox(epicAccountId: $epicAccountId, sandboxId: $sandboxId) {
      records {
        playerAchievements {
          playerAchievement { achievementName unlocked unlockDate }
        }
      }
    }
  }
}`

interface AccountSession {
  readonly refreshToken: Secret
  readonly session: EpicSession | null
}

interface GameDetails extends EpicCatalogDetails {
  readonly achievements: number
  readonly checkedAt: Date
}

export interface EpicProviderOptions {
  readonly now?: () => Date
}

export class EpicProvider implements AchievementProvider {
  readonly platform = 'epic'
  readonly capabilities: ProviderCapabilities = {
    localWatch: false,
    polling: true,
    globalRarity: true,
    oauth: true,
    unofficial: true,
  }

  readonly #now: () => Date
  readonly #accounts = new Map<string, AccountSession>()
  readonly #details = new Map<string, GameDetails>()
  readonly #playtime = new Map<string, ReadonlyMap<string, number>>()

  constructor({ now = () => new Date() }: EpicProviderOptions = {}) {
    this.#now = now
  }

  async authenticate(input: AuthInput, signal?: AbortSignal): Promise<AccountCredentials> {
    if (input.kind !== 'token') {
      throw new ProviderError(
        'unsupported',
        'Epic: connect with the code from the Epic sign-in page',
      )
    }
    const session = await exchangeCode(input.value, this.#now(), signal)
    this.#accounts.set(session.accountId, { refreshToken: session.refreshToken, session })
    return { platform: 'epic', externalId: session.accountId, secret: session.refreshToken }
  }

  async validate(credentials: AccountCredentials, signal?: AbortSignal): Promise<AccountInfo> {
    const session = await this.#session(credentials, signal)
    return { externalId: session.accountId, displayName: session.displayName ?? 'Epic account' }
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
      const records = await this.#library(session, signal)
      const playtime = parsePlaytime(
        await epicGet(`${LIBRARY}/playtime/account/${session.accountId}/all`, {
          auth: session.authorization,
          signal,
        }),
      )
      const previous = this.#playtime.get(session.accountId)
      this.#playtime.set(session.accountId, playtime)

      const games: RemoteGame[] = []
      for (const [namespace, group] of groupByNamespace(records)) {
        const details = await this.#gameDetails(namespace, group, session, signal)
        if (details.achievements === 0) continue

        const played = sum(group.map((record) => playtime.get(record.appName) ?? 0))
        const reported = group.some((record) => playtime.has(record.appName))
        const before = previous && sum(group.map((record) => previous.get(record.appName) ?? 0))
        games.push({
          ref: { externalId: namespace },
          title: details.title ?? group[0]?.sandboxName?.trim() ?? namespace,
          iconUrl: null,
          coverUrl: details.coverUrl,
          portraitUrl: details.portraitUrl,
          heroUrl: details.heroUrl,
          lastPlayed: null,
          recentlyPlayed: before === undefined ? played > 0 : played > before,
          playtimeSeconds: reported ? played : null,
        })
      }
      return games
    })
  }

  fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
    signal?: AbortSignal,
  ): Promise<RemoteGameAchievements> {
    return this.#withSession(credentials, signal, async (session) => {
      const [schema, player] = await Promise.all([
        epicGraphql(
          ACHIEVEMENTS_QUERY,
          { SandboxId: game.externalId, Locale: ACHIEVEMENT_LOCALE },
          { signal },
        ),
        epicGraphql(
          PLAYER_QUERY,
          { epicAccountId: session.accountId, sandboxId: game.externalId },
          { auth: session.authorization, signal },
        ),
      ])
      return toGameAchievements(parseAchievements(schema), parsePlayerUnlocks(player))
    })
  }

  async #library(session: EpicSession, signal?: AbortSignal): Promise<EpicLibraryRecord[]> {
    const records: EpicLibraryRecord[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_LIBRARY_PAGES; page++) {
      const url = new URL(`${LIBRARY}/items`)
      url.searchParams.set('includeMetadata', 'true')
      url.searchParams.set('platform', 'Windows')
      if (cursor !== null) url.searchParams.set('cursor', cursor)

      const parsed = parseLibraryPage(
        await epicGet(url.toString(), { auth: session.authorization, signal }),
      )
      records.push(...parsed.records)
      cursor = parsed.nextCursor
      if (cursor === null) return records
    }
    throw new ProviderError('parse', `Epic: more than ${MAX_LIBRARY_PAGES} pages of library`)
  }

  async #gameDetails(
    namespace: string,
    records: readonly EpicLibraryRecord[],
    session: EpicSession,
    signal?: AbortSignal,
  ): Promise<GameDetails> {
    const cached = this.#details.get(namespace)
    if (cached && this.#now().getTime() - cached.checkedAt.getTime() < DETAILS_TTL_MS) {
      return cached
    }

    const achievements = parseAchievementCount(
      await epicGraphql(
        COUNT_QUERY,
        { SandboxId: namespace, Locale: ACHIEVEMENT_LOCALE },
        { signal },
      ),
    )
    let catalog: EpicCatalogDetails = NO_CATALOG
    if (achievements > 0) {
      const url = new URL(`${CATALOG}/${namespace}/bulk/items`)
      url.searchParams.set('id', [...new Set(records.map((r) => r.catalogItemId))].join(','))
      url.searchParams.set('country', COUNTRY)
      url.searchParams.set('locale', LOCALE)
      url.searchParams.set('includeMainGameDetails', 'true')
      catalog = parseCatalog(await epicGet(url.toString(), { auth: session.authorization, signal }))
    }

    const details: GameDetails = { ...catalog, achievements, checkedAt: this.#now() }
    this.#details.set(namespace, details)
    return details
  }

  async #withSession<T>(
    credentials: AccountCredentials,
    signal: AbortSignal | undefined,
    run: (session: EpicSession) => Promise<T>,
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

  async #session(credentials: AccountCredentials, signal?: AbortSignal): Promise<EpicSession> {
    const cached = this.#accounts.get(credentials.externalId)?.session
    if (cached && cached.expiresAt.getTime() - this.#now().getTime() > EXPIRY_MARGIN_MS) {
      return cached
    }

    const session = await refreshSession(this.#refreshToken(credentials), this.#now(), signal)
    if (session.accountId !== credentials.externalId) {
      throw new ProviderError('other', 'Epic: the saved sign-in belongs to a different account')
    }
    this.#accounts.set(credentials.externalId, { refreshToken: session.refreshToken, session })
    return session
  }

  #refreshToken(credentials: AccountCredentials): Secret {
    const latest = this.#accounts.get(credentials.externalId)?.refreshToken
    if (latest) return latest
    if (credentials.secret === null) {
      throw new ProviderError('auth_expired', 'Epic: no sign-in is stored for this account')
    }
    return credentials.secret
  }

  #dropSession(credentials: AccountCredentials): void {
    const entry = this.#accounts.get(credentials.externalId)
    if (entry) this.#accounts.set(credentials.externalId, { ...entry, session: null })
  }
}

function groupByNamespace(records: readonly EpicLibraryRecord[]): Map<string, EpicLibraryRecord[]> {
  const groups = new Map<string, EpicLibraryRecord[]>()
  for (const record of records) {
    const group = groups.get(record.namespace)
    if (group) group.push(record)
    else groups.set(record.namespace, [record])
  }
  return groups
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
