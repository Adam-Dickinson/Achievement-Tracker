import { ProviderError } from '@shared/errors'
import type {
  AccountCredentials,
  AccountInfo,
  RemoteGame,
  RemoteGameAchievements,
  RemoteGameRef,
} from '@shared/models'
import type { AchievementProvider, AuthInput, ProviderCapabilities } from '@shared/provider'
import { Secret } from '@shared/secret'
import { steamGet } from './api'
import {
  fetchFamilyApps,
  fetchStoreAchievementFlags,
  type FamilyToken,
  readSteamSecret,
  requestFamilyToken,
  toFamilyGame,
} from './family'
import { accountIdOf, STEAM_LOCAL, type SteamLocalDeps, watchSteamLocal } from './local'
import {
  parseGameSchema,
  parseGlobalPercentages,
  parseLibrary,
  parsePlayerAchievements,
  parsePlayerSummary,
  toGameAchievements,
} from './parse'

const PLAYER_SUMMARIES = '/ISteamUser/GetPlayerSummaries/v2/'
const OWNED_GAMES = '/IPlayerService/GetOwnedGames/v1/'
const RECENTLY_PLAYED = '/IPlayerService/GetRecentlyPlayedGames/v1/'
const GAME_SCHEMA = '/ISteamUserStats/GetSchemaForGame/v2/'
const PLAYER_ACHIEVEMENTS = '/ISteamUserStats/GetPlayerAchievements/v1/'
const GLOBAL_PERCENTAGES = '/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/'

const STEAM_ID64 = /^7656119\d{10}$/
const API_KEY = /^[0-9A-F]{32}$/i
const LANGUAGE = 'english'
const TOKEN_MARGIN_MS = 60 * 60_000

export interface SteamProviderOptions {
  readonly now?: () => Date
}

export class SteamProvider implements AchievementProvider {
  readonly platform = 'steam'
  readonly capabilities: ProviderCapabilities = {
    localWatch: true,
    polling: true,
    globalRarity: true,
    oauth: false,
    unofficial: false,
  }

  readonly #local: SteamLocalDeps
  readonly #now: () => Date
  readonly #familyTokens = new Map<string, Promise<FamilyToken>>()
  readonly #hasAchievements = new Map<string, boolean>()

  constructor(
    local: SteamLocalDeps = STEAM_LOCAL,
    { now = () => new Date() }: SteamProviderOptions = {},
  ) {
    this.#local = local
    this.#now = now
  }

  async authenticate(input: AuthInput, signal?: AbortSignal): Promise<AccountCredentials> {
    if (input.kind !== 'api_key') {
      throw new ProviderError('unsupported', 'Steam: connect with an API key and a SteamID')
    }
    const steamId = input.accountId.trim()
    if (!STEAM_ID64.test(steamId)) {
      throw new ProviderError('other', 'Steam: the SteamID should be 17 digits starting 7656119')
    }
    const key = new Secret(input.key.expose().trim())
    if (!API_KEY.test(key.expose())) {
      throw new ProviderError('other', 'Steam: the API key should be 32 letters and digits')
    }

    const credentials: AccountCredentials = { platform: 'steam', externalId: steamId, secret: key }
    await this.validate(credentials, signal)
    return credentials
  }

  async validate(credentials: AccountCredentials, signal?: AbortSignal): Promise<AccountInfo> {
    const json = await steamGet(
      PLAYER_SUMMARIES,
      { steamids: credentials.externalId },
      { key: requireKey(credentials), signal },
    )
    return parsePlayerSummary(json)
  }

  async listGames(
    credentials: AccountCredentials,
    signal?: AbortSignal,
  ): Promise<readonly RemoteGame[]> {
    const { key, family } = readSecret(credentials)
    const steamid = credentials.externalId
    const [owned, recent] = await Promise.all([
      steamGet(
        OWNED_GAMES,
        { steamid, include_appinfo: 1, include_played_free_games: 1 },
        { key, signal },
      ),
      steamGet(RECENTLY_PLAYED, { steamid }, { key, signal }),
    ])
    const games = parseLibrary(owned, recent)
    if (family === null) return games
    const known = new Set(games.map((game) => game.ref.externalId))
    const shared = await this.#familyGames(steamid, key, family, known, signal)
    return [...games, ...shared]
  }

  async fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
    signal?: AbortSignal,
  ): Promise<RemoteGameAchievements> {
    const key = requireKey(credentials)
    const appid = game.externalId
    const [schema, player, rarity] = await Promise.all([
      steamGet(GAME_SCHEMA, { appid, l: LANGUAGE }, { key, signal }),
      steamGet(
        PLAYER_ACHIEVEMENTS,
        { steamid: credentials.externalId, appid, l: LANGUAGE },
        { key, signal },
      ),
      steamGet(GLOBAL_PERCENTAGES, { gameid: appid }, { signal }),
    ])
    return toGameAchievements(
      parseGameSchema(schema),
      parsePlayerAchievements(player),
      parseGlobalPercentages(rarity),
    )
  }

  async #familyGames(
    steamId: string,
    key: Secret,
    family: Secret,
    known: ReadonlySet<string>,
    signal?: AbortSignal,
  ): Promise<RemoteGame[]> {
    try {
      const { token } = await this.#familyToken(steamId, family)
      const apps = (await fetchFamilyApps(token, steamId, signal)).filter(
        (app) => !known.has(app.appid),
      )
      await this.#learnAchievements(
        apps.map((app) => app.appid),
        key,
        signal,
      )
      const now = this.#now()
      return apps
        .filter((app) => this.#hasAchievements.get(app.appid) === true)
        .map((app) => toFamilyGame(app, now))
    } catch (error) {
      if (!(error instanceof ProviderError) || signal?.aborted) throw error
      if (error.kind === 'auth_expired') this.#familyTokens.delete(steamId)
      console.warn(`Steam: left out the family library this time (${error.message})`)
      return []
    }
  }

  #familyToken(steamId: string, family: Secret): Promise<FamilyToken> {
    const cached = this.#familyTokens.get(steamId)
    if (cached) {
      return cached.then((token) =>
        token.expiresAt.getTime() - this.#now().getTime() > TOKEN_MARGIN_MS
          ? token
          : this.#newFamilyToken(steamId, family),
      )
    }
    return this.#newFamilyToken(steamId, family)
  }

  #newFamilyToken(steamId: string, family: Secret): Promise<FamilyToken> {
    const token = requestFamilyToken(family)
    this.#familyTokens.set(steamId, token)
    token.catch(() => {
      if (this.#familyTokens.get(steamId) === token) this.#familyTokens.delete(steamId)
    })
    return token
  }

  async #learnAchievements(
    appids: readonly string[],
    key: Secret,
    signal?: AbortSignal,
  ): Promise<void> {
    const unknown = appids.filter((appid) => !this.#hasAchievements.has(appid))
    if (unknown.length === 0) return
    const flags = await fetchStoreAchievementFlags(unknown, signal)
    for (const [appid, flag] of flags) {
      const has =
        flag ??
        parseGameSchema(await steamGet(GAME_SCHEMA, { appid, l: LANGUAGE }, { key, signal }))
          .length > 0
      this.#hasAchievements.set(appid, has)
    }
  }

  watch(credentials: AccountCredentials, onChange: (game: RemoteGameRef) => void): () => void {
    const accountId = accountIdOf(credentials.externalId)
    if (accountId === null) return () => undefined
    return watchSteamLocal(this.#local, accountId, (appId) => onChange({ externalId: appId }))
  }
}

function requireKey(credentials: AccountCredentials): Secret {
  return readSecret(credentials).key
}

function readSecret(credentials: AccountCredentials): { key: Secret; family: Secret | null } {
  if (credentials.secret === null) {
    throw new ProviderError('auth_expired', 'Steam: no API key is stored for this account')
  }
  return readSteamSecret(credentials.secret)
}
