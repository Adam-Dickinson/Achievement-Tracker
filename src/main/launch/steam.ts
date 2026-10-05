import { join } from 'node:path'
import type { LocalFiles } from '../providers/local-files'
import { STEAM_KEY, type RegistryValue } from '../providers/steam/local'
import type { InstallAdapter, InstalledGame } from './types'
import { parseVdf, type VdfObject } from './vdf'

const MAX_MANIFEST_BYTES = 1_000_000
const INSTALLED_FLAG = 4
const MANIFEST_NAME = /^appmanifest_(\d+)\.acf$/

export interface SteamInstallDeps {
  readonly readRegistry: (key: string, name: string) => Promise<RegistryValue>
  readonly files: Pick<LocalFiles, 'readText' | 'listFolder'>
}

export function createSteamInstallAdapter(deps: SteamInstallDeps): InstallAdapter {
  return {
    platform: 'steam',
    async findInstalled() {
      const steamPath = await deps.readRegistry(STEAM_KEY, 'SteamPath')
      if (typeof steamPath !== 'string' || steamPath === '') return []
      const libraries = await libraryFolders(deps, steamPath)
      const found = await Promise.all(libraries.map((library) => installedIn(deps, library)))
      return found.flat()
    },
  }
}

async function libraryFolders(deps: SteamInstallDeps, steamPath: string): Promise<string[]> {
  const folders = new Map<string, string>([[folderKey(steamPath), steamPath]])
  try {
    const text = await deps.files.readText(
      join(steamPath, 'steamapps', 'libraryfolders.vdf'),
      MAX_MANIFEST_BYTES,
    )
    if (text !== null) {
      const root = parseVdf(text)['libraryfolders']
      if (typeof root === 'object') {
        for (const entry of Object.values(root)) {
          const path = typeof entry === 'object' ? entry['path'] : undefined
          if (typeof path !== 'string' || path === '') continue
          if (!folders.has(folderKey(path))) folders.set(folderKey(path), path)
        }
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Launch: read only the main Steam library this time (${reason})`)
  }
  return [...folders.values()]
}

function folderKey(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

async function installedIn(deps: SteamInstallDeps, library: string): Promise<InstalledGame[]> {
  try {
    return await scanLibrary(deps, library)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Launch: skipped the Steam library at ${library} (${reason})`)
    return []
  }
}

async function scanLibrary(deps: SteamInstallDeps, library: string): Promise<InstalledGame[]> {
  const apps = join(library, 'steamapps')
  const entries = await deps.files.listFolder(apps)
  if (entries === null) return []
  const games = await Promise.all(
    entries
      .filter((entry) => MANIFEST_NAME.test(entry.name))
      .map((entry) => readManifest(deps, join(apps, entry.name))),
  )
  return games.filter((game) => game !== null)
}

async function readManifest(deps: SteamInstallDeps, path: string): Promise<InstalledGame | null> {
  try {
    const text = await deps.files.readText(path, MAX_MANIFEST_BYTES)
    if (text === null) return null
    const state = parseVdf(text)['AppState']
    return typeof state === 'object' ? toGame(state) : null
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Launch: skipped a Steam manifest (${reason})`)
    return null
  }
}

function toGame(state: VdfObject): InstalledGame | null {
  const appid = state['appid']
  const name = state['name']
  const flags = Number(state['StateFlags'])
  if (typeof appid !== 'string' || !/^\d+$/.test(appid) || typeof name !== 'string') return null
  if (!Number.isInteger(flags) || (flags & INSTALLED_FLAG) !== INSTALLED_FLAG) return null
  return {
    platform: 'steam',
    externalId: appid,
    title: name,
    target: { kind: 'uri', uri: `steam://rungameid/${appid}` },
  }
}
