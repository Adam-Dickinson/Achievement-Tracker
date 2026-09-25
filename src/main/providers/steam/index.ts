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

  constructor(local: SteamLocalDeps = STEAM_LOCAL) {
    this.#local = local
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
    const key = requireKey(credentials)
    const steamid = credentials.externalId
    const [owned, recent] = await Promise.all([
      steamGet(
        OWNED_GAMES,
        { steamid, include_appinfo: 1, include_played_free_games: 1 },
        { key, signal },
      ),
      steamGet(RECENTLY_PLAYED, { steamid }, { key, signal }),
    ])
    return parseLibrary(owned, recent)
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

  watch(credentials: AccountCredentials, onChange: (game: RemoteGameRef) => void): () => void {
    const accountId = accountIdOf(credentials.externalId)
    if (accountId === null) return () => undefined
    return watchSteamLocal(this.#local, accountId, (appId) => onChange({ externalId: appId }))
  }
}

function requireKey(credentials: AccountCredentials): Secret {
  if (credentials.secret === null) {
    throw new ProviderError('auth_expired', 'Steam: no API key is stored for this account')
  }
  return credentials.secret
}
