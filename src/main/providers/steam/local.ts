import { execFile } from 'node:child_process'
import { watch } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { ProviderError } from '@shared/errors'
import type { StatsFileReader } from './stats-file'

export const STEAM_KEY = 'HKCU\\Software\\Valve\\Steam'
export const ACTIVE_PROCESS_KEY = `${STEAM_KEY}\\ActiveProcess`
export const REGISTRY_POLL_MS = 5_000
export const RUNNING_GAME_POLL_MS = 30_000
export const DEBOUNCE_MS = 500

const STEAM_ID64_BASE = 76561197960265728n
const MAX_ACCOUNT_ID = 0xffffffffn
const STATS_FILE = /^UserGameStats_(\d+)_(\d+)\.bin$/
const REG_LINE = /^\s+(.+?)\s{4}(REG_[A-Z_]+)(?:\s{4}(.*))?$/

export type RegistryValue = string | number | null

export interface SteamLocalDeps extends StatsFileReader {
  readonly readRegistry: (key: string, name: string) => Promise<RegistryValue>
  readonly watchFolder: (path: string, onFile: (name: string) => void) => () => void
}

export function accountIdOf(steamId64: string): string | null {
  if (!/^\d{17}$/.test(steamId64)) return null
  const accountId = BigInt(steamId64) - STEAM_ID64_BASE
  return accountId > 0n && accountId <= MAX_ACCOUNT_ID ? String(accountId) : null
}

export function statsFileAppId(fileName: string, accountId: string): string | null {
  const match = STATS_FILE.exec(fileName)
  return match?.[1] === accountId ? (match[2] ?? null) : null
}

export function parseRegQuery(stdout: string, name: string): RegistryValue {
  for (const line of stdout.split(/\r?\n/)) {
    const match = REG_LINE.exec(line)
    if (!match || match[1]?.toLowerCase() !== name.toLowerCase()) continue
    const data = match[3]?.trim() ?? ''
    if (match[2] !== 'REG_DWORD') return data
    const value = Number.parseInt(data, 16)
    return Number.isNaN(value) ? null : value
  }
  return null
}

const execFileAsync = promisify(execFile)

async function readRegistry(key: string, name: string): Promise<RegistryValue> {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await execFileAsync('reg', ['query', key, '/v', name], {
      windowsHide: true,
    })
    return parseRegQuery(stdout, name)
  } catch {
    return null
  }
}

function watchFolder(path: string, onFile: (name: string) => void): () => void {
  try {
    const watcher = watch(path, (_event, name) => {
      if (name) onFile(name)
    })
    watcher.on('error', (err) => {
      console.warn(`Stopped watching ${path}`, err)
      watcher.close()
    })
    return () => watcher.close()
  } catch (err) {
    console.warn(`Could not watch ${path}`, err)
    return () => undefined
  }
}

export async function readFile(path: string, maxBytes: number): Promise<Buffer | null> {
  let file
  try {
    file = await open(path, 'r')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  try {
    const { size } = await file.stat()
    if (size > maxBytes) {
      throw new ProviderError('parse', `Steam: ${basename(path)} is larger than ${maxBytes} bytes`)
    }
    return await file.readFile()
  } finally {
    await file.close()
  }
}

export function statsFolder(steamPath: RegistryValue): string | null {
  return typeof steamPath === 'string' && steamPath !== ''
    ? join(steamPath, 'appcache', 'stats')
    : null
}

export const STEAM_LOCAL: SteamLocalDeps = { readRegistry, watchFolder, readFile }

export function watchSteamLocal(
  deps: SteamLocalDeps,
  accountId: string,
  onGame: (appId: string) => void,
): () => void {
  let stopped = false
  let stopFolder = (): void => undefined
  const debounces = new Map<string, ReturnType<typeof setTimeout>>()

  const onStatsFile = (name: string): void => {
    const appId = statsFileAppId(name, accountId)
    if (!appId) return
    clearTimeout(debounces.get(appId))
    debounces.set(
      appId,
      setTimeout(() => {
        debounces.delete(appId)
        onGame(appId)
      }, DEBOUNCE_MS),
    )
  }

  let runningAppId = 0
  let runningTimer: ReturnType<typeof setInterval> | undefined
  let checking = false

  const followRunningGame = async (): Promise<void> => {
    const running = await deps.readRegistry(STEAM_KEY, 'RunningAppID')
    const appId = typeof running === 'number' ? running : 0
    if (stopped || appId === runningAppId) return
    runningAppId = appId
    clearInterval(runningTimer)
    runningTimer = undefined
    if (appId === 0) return

    const activeUser = await deps.readRegistry(ACTIVE_PROCESS_KEY, 'ActiveUser')
    if (stopped || appId !== runningAppId || String(activeUser) !== accountId) return
    const game = String(appId)
    onGame(game)
    runningTimer = setInterval(() => onGame(game), RUNNING_GAME_POLL_MS)
  }

  const checkRunningGame = async (): Promise<void> => {
    if (checking) return
    checking = true
    try {
      await followRunningGame()
    } finally {
      checking = false
    }
  }

  void deps.readRegistry(STEAM_KEY, 'SteamPath').then((steamPath) => {
    const folder = statsFolder(steamPath)
    if (stopped || folder === null) return
    stopFolder = deps.watchFolder(folder, onStatsFile)
  })
  const registryTimer = setInterval(() => void checkRunningGame(), REGISTRY_POLL_MS)
  void checkRunningGame()

  return () => {
    stopped = true
    stopFolder()
    clearInterval(registryTimer)
    clearInterval(runningTimer)
    for (const timer of debounces.values()) clearTimeout(timer)
    debounces.clear()
  }
}
