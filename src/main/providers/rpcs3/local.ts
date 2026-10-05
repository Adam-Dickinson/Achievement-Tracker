import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ProviderError } from '@shared/errors'
import type { RemoteGame } from '@shared/models'
import type { LocalFiles } from '../local-files'
import {
  MAX_TROPCONF_BYTES,
  MAX_USERNAME_BYTES,
  parseTrophyList,
  parseUserName,
  type TrophyList,
} from './parse'
import { MAX_TROPUSR_BYTES, parseTropUsr, type TropUsr } from './parse-tropusr'

export const DEBOUNCE_MS = 400
export const RETRY_READ_MS = 300
export const RECENT_MS = 14 * 24 * 60 * 60_000

const SEPARATOR = '|'
const USER_ID = /^\d{8}$/
const NP_COMM_ID_DIR = /^NPWR\d{5}_\d{2}$/i
const USER_TROPHY_PATH = /^(NPWR\d{5}_\d{2})[\\/]TROPUSR\.DAT$/i
const TROPHY_LIST_FILE = 'TROPCONF.SFM'
const USER_TROPHY_FILE = 'TROPUSR.DAT'

export interface Rpcs3Account {
  readonly dataDir: string
  readonly userId: string
}

export interface Rpcs3UserSummary {
  readonly id: string
  readonly name: string
  readonly games: number
  readonly unlocked: number
}

export function accountExternalId({ dataDir, userId }: Rpcs3Account): string {
  return `${dataDir}${SEPARATOR}${userId}`
}

export function parseAccountExternalId(externalId: string): Rpcs3Account {
  const at = externalId.lastIndexOf(SEPARATOR)
  const dataDir = externalId.slice(0, at)
  const userId = externalId.slice(at + 1)
  if (at <= 0 || !USER_ID.test(userId)) {
    throw new ProviderError('other', 'RPCS3: this account does not name an install folder and user')
  }
  return { dataDir, userId }
}

export function dataDirOf(externalId: string): string | null {
  try {
    return parseAccountExternalId(externalId).dataDir
  } catch {
    return null
  }
}

export function defaultDataDirs(
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string[] {
  if (platform === 'linux') return [join(home, '.config', 'rpcs3')]
  if (platform === 'darwin') return [join(home, 'Library', 'Application Support', 'rpcs3')]
  return []
}

export async function isDataDir(files: LocalFiles, dir: string): Promise<boolean> {
  const entries = await files.listFolder(join(dir, 'dev_hdd0'))
  return entries !== null
}

export async function listUsers(files: LocalFiles, dataDir: string): Promise<Rpcs3UserSummary[]> {
  const entries = (await files.listFolder(homeDir(dataDir))) ?? []
  const ids = entries.filter((entry) => entry.isDirectory && USER_ID.test(entry.name))
  return Promise.all(
    ids.map(async ({ name: userId }) => {
      const account = { dataDir, userId }
      const progress = await Promise.all(
        (await trophyFolders(files, account)).map(({ npCommId }) =>
          readUserTrophies(files, account, npCommId).catch(() => null),
        ),
      )
      return {
        id: userId,
        name: await userName(files, account),
        games: progress.length,
        unlocked: progress.reduce((sum, game) => sum + (game?.unlocks.length ?? 0), 0),
      }
    }),
  )
}

export async function userName(files: LocalFiles, account: Rpcs3Account): Promise<string> {
  const source = await files.readText(
    join(homeDir(account.dataDir), account.userId, 'localusername'),
    MAX_USERNAME_BYTES,
  )
  return (source === null ? null : parseUserName(source)) ?? `User ${account.userId}`
}

export async function listGames(
  files: LocalFiles,
  account: Rpcs3Account,
  now: Date,
): Promise<RemoteGame[]> {
  const found = await trophyFolders(files, account)
  return Promise.all(
    found.map(async ({ npCommId, modifiedAt }) => ({
      ref: { externalId: npCommId },
      title: (await readTrophyList(files, account, npCommId).catch(() => null))?.title ?? npCommId,
      iconUrl: null,
      coverUrl: await trophyIcon(files, join(trophyDir(account), npCommId)),
      lastPlayed: modifiedAt,
      recentlyPlayed: now.getTime() - modifiedAt.getTime() < RECENT_MS,
    })),
  )
}

export async function readTrophyList(
  files: LocalFiles,
  account: Rpcs3Account,
  npCommId: string,
): Promise<TrophyList | null> {
  const source = await files.readText(
    join(trophyDir(account), npCommId, TROPHY_LIST_FILE),
    MAX_TROPCONF_BYTES,
  )
  if (source === null) return null
  const list = parseTrophyList(source)
  if (list.npCommId !== npCommId) {
    throw new ProviderError('parse', `RPCS3: the list for ${npCommId} is for ${list.npCommId}`)
  }
  return list
}

export async function readUserTrophies(
  files: LocalFiles,
  account: Rpcs3Account,
  npCommId: string,
  retryDelay: (ms: number) => Promise<void> = () => Promise.resolve(),
): Promise<TropUsr | null> {
  const path = join(trophyDir(account), npCommId, USER_TROPHY_FILE)
  const read = async (): Promise<TropUsr | null> => {
    const bytes = await files.readBytes(path, MAX_TROPUSR_BYTES)
    return bytes === null ? null : parseTropUsr(bytes)
  }
  try {
    return await read()
  } catch (err) {
    if (!(err instanceof ProviderError) || err.kind !== 'parse') throw err
    await retryDelay(RETRY_READ_MS)
    return read()
  }
}

export function watchUserTrophies(
  files: LocalFiles,
  account: Rpcs3Account,
  onGame: (npCommId: string) => void,
): () => void {
  const debounces = new Map<string, ReturnType<typeof setTimeout>>()

  const onFile = (name: string): void => {
    const npCommId = USER_TROPHY_PATH.exec(name)?.[1]?.toUpperCase()
    if (!npCommId) return
    clearTimeout(debounces.get(npCommId))
    debounces.set(
      npCommId,
      setTimeout(() => {
        debounces.delete(npCommId)
        onGame(npCommId)
      }, DEBOUNCE_MS),
    )
  }

  const stopFolder = files.watchFolder(trophyDir(account), onFile, { recursive: true })
  return () => {
    stopFolder()
    for (const timer of debounces.values()) clearTimeout(timer)
    debounces.clear()
  }
}

function homeDir(dataDir: string): string {
  return join(dataDir, 'dev_hdd0', 'home')
}

function trophyDir({ dataDir, userId }: Rpcs3Account): string {
  return join(homeDir(dataDir), userId, 'trophy')
}

async function trophyIcon(files: LocalFiles, folder: string): Promise<string | null> {
  try {
    const entries = await files.listFolder(folder)
    const icon = entries?.find(
      (entry) => !entry.isDirectory && entry.name.toUpperCase() === 'ICON0.PNG',
    )
    return icon ? pathToFileURL(join(folder, icon.name)).href : null
  } catch {
    return null
  }
}

async function trophyFolders(
  files: LocalFiles,
  account: Rpcs3Account,
): Promise<{ readonly npCommId: string; readonly modifiedAt: Date }[]> {
  const entries = (await files.listFolder(trophyDir(account))) ?? []
  const folders = entries.filter((entry) => entry.isDirectory && NP_COMM_ID_DIR.test(entry.name))
  const found = await Promise.all(
    folders.map(async ({ name }) => {
      const inside = await files.listFolder(join(trophyDir(account), name))
      const progress = inside?.find((entry) => entry.name.toUpperCase() === USER_TROPHY_FILE)
      return progress ? { npCommId: name.toUpperCase(), modifiedAt: progress.modifiedAt } : null
    }),
  )
  return found.filter((game) => game !== null)
}
