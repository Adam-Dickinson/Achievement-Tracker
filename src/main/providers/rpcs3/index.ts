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
import { LOCAL_FILES, type LocalFiles } from '../local-files'
import {
  accountExternalId,
  isDataDir,
  listGames,
  parseAccountExternalId,
  readTrophyList,
  readUserTrophies,
  userName,
  watchUserTrophies,
  type Rpcs3Account,
} from './local'
import { achievementId } from './parse'

export interface Rpcs3ProviderOptions {
  readonly now?: () => Date
  readonly delay?: (ms: number) => Promise<void>
}

export class Rpcs3Provider implements AchievementProvider {
  readonly platform = 'rpcs3'
  readonly capabilities: ProviderCapabilities = {
    localWatch: true,
    polling: true,
    globalRarity: false,
    oauth: false,
    unofficial: false,
  }

  readonly #files: LocalFiles
  readonly #now: () => Date
  readonly #delay: (ms: number) => Promise<void>

  constructor(
    files: LocalFiles = LOCAL_FILES,
    {
      now = () => new Date(),
      delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }: Rpcs3ProviderOptions = {},
  ) {
    this.#files = files
    this.#now = now
    this.#delay = delay
  }

  async authenticate(input: AuthInput): Promise<AccountCredentials> {
    if (input.kind !== 'local_path') {
      throw new ProviderError('unsupported', 'RPCS3: connect by choosing its install folder')
    }
    const account = parseAccountExternalId(input.path)
    const credentials = this.#credentials(account)
    await this.validate(credentials)
    return credentials
  }

  async validate(credentials: AccountCredentials): Promise<AccountInfo> {
    const account = parseAccountExternalId(credentials.externalId)
    if (!(await isDataDir(this.#files, account.dataDir))) {
      throw new ProviderError('other', `RPCS3: no RPCS3 data in ${account.dataDir}`)
    }
    return {
      externalId: credentials.externalId,
      displayName: await userName(this.#files, account),
    }
  }

  async listGames(credentials: AccountCredentials): Promise<readonly RemoteGame[]> {
    return listGames(this.#files, parseAccountExternalId(credentials.externalId), this.#now())
  }

  async fetchGame(
    credentials: AccountCredentials,
    game: RemoteGameRef,
  ): Promise<RemoteGameAchievements> {
    const account = parseAccountExternalId(credentials.externalId)
    const list = await readTrophyList(this.#files, account, game.externalId)
    if (!list) {
      throw new ProviderError('parse', `RPCS3: no trophy list for ${game.externalId}`)
    }
    const user = await readUserTrophies(this.#files, account, game.externalId, this.#delay)
    const known = new Set(list.achievements.map((achievement) => achievement.externalId))
    const unlocks = (user?.unlocks ?? []).flatMap((unlock): RemoteUnlock[] => {
      const achievementExternalId = achievementId(unlock.trophyId)
      return known.has(achievementExternalId)
        ? [{ achievementExternalId, unlockedAt: unlock.unlockedAt, progress: null }]
        : []
    })
    return { achievements: list.achievements, unlocks }
  }

  watch(credentials: AccountCredentials, onChange: (game: RemoteGameRef) => void): () => void {
    return watchUserTrophies(
      this.#files,
      parseAccountExternalId(credentials.externalId),
      (npCommId) => onChange({ externalId: npCommId }),
    )
  }

  #credentials(account: Rpcs3Account): AccountCredentials {
    return { platform: 'rpcs3', externalId: accountExternalId(account), secret: null }
  }
}
