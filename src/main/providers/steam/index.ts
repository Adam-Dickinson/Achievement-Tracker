import { ProviderError } from '@shared/errors'
import type {
  AccountCredentials,
  AccountInfo,
  RemoteGame,
  RemoteGameAchievements,
  RemoteGameRef,
  RemoteUnlock,
} from '@shared/models'
import type { AchievementProvider, AuthInput, ProviderCapabilities } from '@shared/provider'
import { Secret } from '@shared/secret'
import { steamGet } from './api'
import { fetchFamilyApps, fetchStoreAchievementFlags, toFamilyGame } from './family'
import {
  accountIdOf,
  STEAM_KEY,
  STEAM_LOCAL,
  type SteamLocalDeps,
  statsFolder,
  watchSteamLocal,
} from './local'
import {
  parseGameSchema,
  parseGlobalPercentages,
  parseLibrary,
  parsePlayerAchievements,
  parsePlayerSummary,
  toGameAchievements,
} from './parse'
import { readSteamSecret, requestSteamSession, type SteamSession } from './session'
import { readLocalUnlocks, withLocalUnlocks } from './stats-file'
import { fetchStoreArt, type StoreArt } from './store-assets'

const COVER_TTL_MS = 24 * 60 * 60_000
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
  readonly #familyTokens = new Map<string, Promise<SteamSession>>()
  readonly #hasAchievements = new Map<string, boolean>()
  readonly #covers = new Map<string, { readonly art: StoreArt; readonly at: number }>()
  #statsFolder: Promise<string | null> | undefined

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
    if (family === null) return this.#withCovers(games, signal)
    const known = new Set(games.map((game) => game.ref.externalId))
    const shared = await this.#familyGames(steamid, key, family, known, signal)
    return this.#withCovers([...games, ...shared], signal)
  }

  async fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
    signal?: AbortSignal,
  ): Promise<RemoteGameAchievements> {
    const key = requireKey(credentials)
    const appid = game.externalId
    const [schema, player, rarity, local] = await Promise.all([
      steamGet(GAME_SCHEMA, { appid, l: LANGUAGE }, { key, signal }),
      steamGet(
        PLAYER_ACHIEVEMENTS,
        { steamid: credentials.externalId, appid, l: LANGUAGE },
        { key, signal },
      ),
      steamGet(GLOBAL_PERCENTAGES, { gameid: appid }, { signal }),
      this.#localUnlocks(credentials.externalId, appid),
    ])
    const remote = toGameAchievements(
      parseGameSchema(schema),
      parsePlayerAchievements(player),
      parseGlobalPercentages(rarity),
    )
    return withLocalUnlocks(remote, local)
  }

  async #localUnlocks(steamId: string, appid: string): Promise<RemoteUnlock[]> {
    const accountId = accountIdOf(steamId)
    if (accountId === null) return []
    try {
      this.#statsFolder ??= this.#local.readRegistry(STEAM_KEY, 'SteamPath').then(statsFolder)
      const folder = await this.#statsFolder
      return folder === null ? [] : await readLocalUnlocks(this.#local, folder, accountId, appid)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`Steam: used only the Web API for ${appid} this time (${reason})`)
      return []
    }
  }

  async #withCovers(
    games: readonly RemoteGame[],
    signal?: AbortSignal,
  ): Promise<readonly RemoteGame[]> {
    const now = this.#now().getTime()
    const stale = games
      .map((game) => game.ref.externalId)
      .filter((appid) => {
        const cover = this.#covers.get(appid)
        return !cover || now - cover.at > COVER_TTL_MS
      })
    if (stale.length > 0) {
      try {
        for (const [appid, art] of await fetchStoreArt(stale, signal)) {
          this.#covers.set(appid, { art, at: now })
        }
      } catch (error) {
        if (!(error instanceof ProviderError) || signal?.aborted) throw error
        console.warn(`Steam: kept the last covers this time (${error.message})`)
      }
    }
    return games.map((game) => {
      const art = this.#covers.get(game.ref.externalId)?.art
      return {
        ...game,
        coverUrl: art?.header ?? null,
        portraitUrl: art?.portrait ?? null,
        heroUrl: art?.hero ?? null,
      }
    })
  }

  async #familyGames(
    steamId: string,
    key: Secret,
    family: Secret,
    known: ReadonlySet<string>,
    signal?: AbortSignal,
  ): Promise<RemoteGame[]> {
    try {
      const { token } = await this.#familySession(steamId, family)
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

  #familySession(steamId: string, family: Secret): Promise<SteamSession> {
    const cached = this.#familyTokens.get(steamId)
    if (cached) {
      return cached.then((token) =>
        token.expiresAt.getTime() - this.#now().getTime() > TOKEN_MARGIN_MS
          ? token
          : this.#newFamilySession(steamId, family),
      )
    }
    return this.#newFamilySession(steamId, family)
  }

  #newFamilySession(steamId: string, family: Secret): Promise<SteamSession> {
    const token = requestSteamSession(family, 'store')
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
