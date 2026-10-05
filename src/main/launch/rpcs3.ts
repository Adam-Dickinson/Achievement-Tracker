import { join } from 'node:path'
import type { LocalFiles } from '../providers/local-files'
import type { InstallAdapter, InstalledGame } from './types'
import { parseGamesYml } from './ps3/games-yml'
import type { ByteSource } from './ps3/iso9660'
import { readPs3Title } from './ps3/title'

const MAX_GAMES_YML_BYTES = 1_000_000

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
      const found = await Promise.all(deps.dataDirs().map((dir) => installedIn(deps, dir)))
      return found.flat()
    },
  }
}

async function installedIn(deps: Rpcs3InstallDeps, dataDir: string): Promise<InstalledGame[]> {
  const exe = await deps.exePath(dataDir)
  if (exe === null) return []
  const text = await deps.files.readText(join(dataDir, 'config', 'games.yml'), MAX_GAMES_YML_BYTES)
  if (text === null) return []

  const games = await Promise.all(
    parseGamesYml(text).map(async ({ serial, path }): Promise<InstalledGame | null> => {
      try {
        const sfo = await readPs3Title(path, deps)
        if (sfo === null) return null
        return {
          platform: 'rpcs3',
          externalId: serial,
          title: sfo.title,
          target: { kind: 'program', exe, args: ['--no-gui', path] },
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(`Launch: skipped the RPCS3 game ${serial} (${reason})`)
        return null
      }
    }),
  )
  return games.filter((game) => game !== null)
}
