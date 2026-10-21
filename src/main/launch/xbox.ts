import { win32 } from 'node:path'
import type { LocalFiles } from '../providers/local-files'
import type { InstallAdapter, InstalledGame } from './types'
import { parseGamingRoot, readXboxPackage } from './xbox-package'

const DRIVE_LETTERS = 'CDEFGHIJKLMNOPQRSTUVWXYZ'
const MAX_GAMING_ROOT_BYTES = 4096
const MAX_PACKAGE_FILE_BYTES = 1_000_000

export interface XboxInstallDeps {
  readonly files: Pick<LocalFiles, 'readText' | 'readBytes' | 'listFolder'>
}

export function createXboxInstallAdapter(deps: XboxInstallDeps): InstallAdapter {
  return {
    platform: 'xbox',
    async findInstalled() {
      const libraries = await Promise.all(
        [...DRIVE_LETTERS].map((letter) => librariesOn(deps, `${letter}:\\`)),
      )
      const folders = await Promise.all(
        libraries.flat().map((library) => gameFolders(deps, library)),
      )
      const games = await Promise.all(folders.flat().map((folder) => readGame(deps, folder)))
      return games.filter((game) => game !== null)
    },
  }
}

async function librariesOn(deps: XboxInstallDeps, drive: string): Promise<string[]> {
  let bytes: Uint8Array | null
  try {
    bytes = await deps.files.readBytes(win32.join(drive, '.GamingRoot'), MAX_GAMING_ROOT_BYTES)
  } catch {
    return []
  }
  if (bytes === null) return []
  try {
    return parseGamingRoot(bytes).map((folder) => win32.join(drive, folder))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Launch: skipped the Xbox games folder on ${drive} (${reason})`)
    return []
  }
}

async function gameFolders(deps: XboxInstallDeps, library: string): Promise<string[]> {
  try {
    const entries = await deps.files.listFolder(library)
    if (entries === null) return []
    return entries
      .filter((entry) => entry.isDirectory)
      .map((entry) => win32.join(library, entry.name))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Launch: skipped the Xbox games folder at ${library} (${reason})`)
    return []
  }
}

async function readGame(deps: XboxInstallDeps, folder: string): Promise<InstalledGame | null> {
  try {
    const content = win32.join(folder, 'Content')
    const [manifest, config] = await Promise.all([
      deps.files.readText(win32.join(content, 'appxmanifest.xml'), MAX_PACKAGE_FILE_BYTES),
      deps.files.readText(win32.join(content, 'MicrosoftGame.config'), MAX_PACKAGE_FILE_BYTES),
    ])
    if (manifest === null || config === null) return null
    const found = readXboxPackage(manifest, config, win32.basename(folder))
    if (found === null) return null
    return {
      platform: 'xbox',
      externalId: found.titleId,
      title: found.title,
      target: { kind: 'package', appUserModelId: found.appUserModelId },
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Launch: skipped the Xbox game at ${folder} (${reason})`)
    return null
  }
}
