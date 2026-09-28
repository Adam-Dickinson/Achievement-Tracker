import { join } from 'node:path'
import { ProviderError } from '@shared/errors'
import type { RemoteGame } from '@shared/models'
import type { LocalFiles } from '../local-files'
import {
  MAX_SETTINGS_FILE_BYTES,
  MAX_TROPHY_FILE_BYTES,
  parseHomeDir,
  parseTrophyList,
  parseUserTrophies,
  parseUsers,
  type ShadPs4User,
  type TrophyList,
  type UserTrophies,
} from './parse'

export const DEBOUNCE_MS = 400
export const RETRY_READ_MS = 300
export const RECENT_MS = 14 * 24 * 60 * 60_000

const SEPARATOR = '|'
const USER_ID = /^\d{1,10}$/
const USER_TROPHY_FILE = /^(NPWR\d{5}_\d{2})\.xml$/i
const TROPHY_LISTS = ['TROP.XML', 'TROPCONF.XML']

export interface ShadPs4Account {
  readonly dataDir: string
  readonly userId: string
}

export interface ShadPs4UserSummary extends ShadPs4User {
  readonly games: number
  readonly unlocked: number
}

export function accountExternalId({ dataDir, userId }: ShadPs4Account): string {
  return `${dataDir}${SEPARATOR}${userId}`
}

export function parseAccountExternalId(externalId: string): ShadPs4Account {
  const at = externalId.lastIndexOf(SEPARATOR)
  const dataDir = externalId.slice(0, at)
  const userId = externalId.slice(at + 1)
  if (at <= 0 || !USER_ID.test(userId)) {
    throw new ProviderError('other', 'shadPS4: this account does not name a data folder and user')
  }
  return { dataDir, userId }
}

export function defaultDataDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  return env.APPDATA ? [join(env.APPDATA, 'shadPS4')] : []
}

export async function isDataDir(files: LocalFiles, dir: string): Promise<boolean> {
  const entries = await files.listFolder(dir)
  return !!entries?.some((entry) => entry.name === 'users.json' || entry.name === 'home')
}

export async function listUsers(files: LocalFiles, dataDir: string): Promise<ShadPs4UserSummary[]> {
  const source = await files.readText(join(dataDir, 'users.json'), MAX_SETTINGS_FILE_BYTES)
  const users = source === null ? await usersFromHome(files, dataDir) : parseUsers(source)
  return Promise.all(
    users.map(async (user) => {
      const progress = await Promise.all(
        (await userTrophyFiles(files, { dataDir, userId: user.id })).map((file) =>
          readUserTrophies(files, { dataDir, userId: user.id }, file.npCommId).catch(() => null),
        ),
      )
      return {
        ...user,
        games: progress.length,
        unlocked: progress.reduce((sum, game) => sum + (game?.unlocks.length ?? 0), 0),
      }
    }),
  )
}

export async function userName(files: LocalFiles, account: ShadPs4Account): Promise<string> {
  const source = await files.readText(join(account.dataDir, 'users.json'), MAX_SETTINGS_FILE_BYTES)
  const user = source === null ? undefined : parseUsers(source).find((u) => u.id === account.userId)
  return user?.name ?? `User ${account.userId}`
}

export async function listGames(
  files: LocalFiles,
  account: ShadPs4Account,
  now: Date,
): Promise<RemoteGame[]> {
  const found = await userTrophyFiles(files, account)
  return Promise.all(
    found.map(async ({ npCommId, modifiedAt }) => ({
      ref: { externalId: npCommId },
      title: (await readTrophyList(files, account.dataDir, npCommId))?.title ?? npCommId,
      iconUrl: null,
      coverUrl: null,
      lastPlayed: modifiedAt,
      recentlyPlayed: now.getTime() - modifiedAt.getTime() < RECENT_MS,
    })),
  )
}

export async function readTrophyList(
  files: LocalFiles,
  dataDir: string,
  npCommId: string,
): Promise<TrophyList | null> {
  for (const name of TROPHY_LISTS) {
    const source = await files.readText(
      join(dataDir, 'trophy', npCommId, 'Xml', name),
      MAX_TROPHY_FILE_BYTES,
    )
    if (source !== null) return checked(parseTrophyList(source), npCommId)
  }
  return null
}

export async function readUserTrophies(
  files: LocalFiles,
  account: ShadPs4Account,
  npCommId: string,
  retryDelay: (ms: number) => Promise<void> = () => Promise.resolve(),
): Promise<UserTrophies | null> {
  const path = join(await userTrophyDir(files, account), `${npCommId}.xml`)
  const read = async (): Promise<UserTrophies | null> => {
    const source = await files.readText(path, MAX_TROPHY_FILE_BYTES)
    return source === null ? null : checked(parseUserTrophies(source), npCommId)
  }
  try {
    return await read()
  } catch (err) {
    if (!(err instanceof ProviderError) || err.kind !== 'parse') throw err
    await retryDelay(RETRY_READ_MS)
    return read()
  }
}

export async function userTrophyDir(files: LocalFiles, account: ShadPs4Account): Promise<string> {
  const config = await files.readText(join(account.dataDir, 'config.json'), MAX_SETTINGS_FILE_BYTES)
  const homeDir = (config === null ? null : safeHomeDir(config)) ?? join(account.dataDir, 'home')
  return join(homeDir, account.userId, 'trophy')
}

export function watchUserTrophies(
  files: LocalFiles,
  account: ShadPs4Account,
  onGame: (npCommId: string) => void,
): () => void {
  let stopped = false
  let stopFolder = (): void => undefined
  const debounces = new Map<string, ReturnType<typeof setTimeout>>()

  const onFile = (name: string): void => {
    const npCommId = USER_TROPHY_FILE.exec(name)?.[1]?.toUpperCase()
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

  void userTrophyDir(files, account).then(
    (dir) => {
      if (!stopped) stopFolder = files.watchFolder(dir, onFile)
    },
    (err: unknown) => console.warn('shadPS4: could not find the trophy folder to watch', err),
  )

  return () => {
    stopped = true
    stopFolder()
    for (const timer of debounces.values()) clearTimeout(timer)
    debounces.clear()
  }
}

async function userTrophyFiles(
  files: LocalFiles,
  account: ShadPs4Account,
): Promise<{ readonly npCommId: string; readonly modifiedAt: Date }[]> {
  const entries = (await files.listFolder(await userTrophyDir(files, account))) ?? []
  return entries.flatMap((entry) => {
    const npCommId = entry.isDirectory ? undefined : USER_TROPHY_FILE.exec(entry.name)?.[1]
    return npCommId ? [{ npCommId: npCommId.toUpperCase(), modifiedAt: entry.modifiedAt }] : []
  })
}

async function usersFromHome(files: LocalFiles, dataDir: string): Promise<ShadPs4User[]> {
  const entries = (await files.listFolder(join(dataDir, 'home'))) ?? []
  return entries
    .filter((entry) => entry.isDirectory && USER_ID.test(entry.name))
    .map((entry) => ({ id: entry.name, name: `User ${entry.name}` }))
}

function safeHomeDir(config: string): string | null {
  try {
    return parseHomeDir(config)
  } catch {
    return null
  }
}

function checked<T extends { readonly npCommId: string }>(parsed: T, npCommId: string): T {
  if (parsed.npCommId !== npCommId) {
    throw new ProviderError('parse', `shadPS4: the file for ${npCommId} is for ${parsed.npCommId}`)
  }
  return parsed
}
