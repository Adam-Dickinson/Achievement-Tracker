import { win32 } from 'node:path'
import type { LocalFiles } from '../providers/local-files'
import type { InstallAdapter, InstalledGame } from './types'
import { parseGamesYml } from './ps3/games-yml'
import type { ByteSource } from './ps3/iso9660'
import { readPs3Title } from './ps3/title'

const MAX_GAMES_YML_BYTES = 1_000_000
const TITLE_CONCURRENCY = 4
const TITLE_TIMEOUT_MS = 10_000

export interface Rpcs3InstallDeps {
  readonly dataDirs: () => string[]
  readonly exePath: (dataDir: string) => Promise<string | null>
  readonly files: Pick<LocalFiles, 'readText' | 'readBytes'>
  readonly openSource: (path: string) => ByteSource
}

export function createRpcs3InstallAdapter(deps: Rpcs3InstallDeps): InstallAdapter {
  return {
    platform: 'rpcs3',
    async findInstalled() {
      const found = await Promise.all(
        uniqueDirs(deps.dataDirs()).map((dir) => installedIn(deps, dir)),
      )
      return found.flat()
    },
  }
}

function uniqueDirs(dirs: readonly string[]): string[] {
  const unique = new Map<string, string>()
  for (const dir of dirs) {
    const key = dir.toLowerCase()
    if (!unique.has(key)) unique.set(key, dir)
  }
  return [...unique.values()]
}

async function installedIn(deps: Rpcs3InstallDeps, dataDir: string): Promise<InstalledGame[]> {
  const exe = await deps.exePath(dataDir)
  if (exe === null) return []
  const text = await deps.files.readText(
    win32.join(dataDir, 'config', 'games.yml'),
    MAX_GAMES_YML_BYTES,
  )
  if (text === null) return []

  const entries = parseGamesYml(text).filter(({ path }) => win32.isAbsolute(path))
  const games = await mapLimit(entries, TITLE_CONCURRENCY, async ({ serial, path }) => {
    try {
      const sfo = await withTimeout(readPs3Title(path, deps))
      if (sfo === null) return null
      const game: InstalledGame = {
        platform: 'rpcs3',
        externalId: serial,
        title: sfo.title,
        target: { kind: 'program', exe, args: ['--no-gui', path] },
      }
      return game
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`Launch: skipped the RPCS3 game ${serial} (${reason})`)
      return null
    }
  })
  return games.filter((game) => game !== null)
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`reading the title took longer than ${TITLE_TIMEOUT_MS / 1000}s`)),
      TITLE_TIMEOUT_MS,
    )
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
