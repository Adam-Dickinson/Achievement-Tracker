import { join } from 'node:path'
import { trophyDir } from './providers/rpcs3/local'

const NP_COMM_ID = /^NPWR\d{5}_\d{2}$/
const MAX_ICON_BYTES = 2 * 1024 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export interface TrophyArtFolder {
  readonly dataDir: string
  readonly userId: string
}

export interface TrophyArtDeps {
  readonly rpcs3Folders: () => TrophyArtFolder[]
  readonly readFile: (path: string, maxBytes: number) => Promise<Uint8Array | null>
}

export interface TrophyArtResponse {
  readonly status: number
  readonly contentType: string
  readonly body: Uint8Array | null
}

const NOT_FOUND: TrophyArtResponse = { status: 404, contentType: 'text/plain', body: null }

export async function resolveTrophyArt(
  url: string,
  deps: TrophyArtDeps,
): Promise<TrophyArtResponse> {
  try {
    const npCommId = parseNpCommId(url)
    if (npCommId === null) return NOT_FOUND
    for (const folder of deps.rpcs3Folders()) {
      const bytes = await readIcon(folder, npCommId, deps)
      if (bytes && isPng(bytes)) return { status: 200, contentType: 'image/png', body: bytes }
    }
    return NOT_FOUND
  } catch {
    return NOT_FOUND
  }
}

async function readIcon(
  folder: TrophyArtFolder,
  npCommId: string,
  deps: TrophyArtDeps,
): Promise<Uint8Array | null> {
  try {
    return await deps.readFile(join(trophyDir(folder), npCommId, 'ICON0.PNG'), MAX_ICON_BYTES)
  } catch {
    return null
  }
}

function parseNpCommId(url: string): string | null {
  const parsed = new URL(url)
  if (parsed.protocol !== 'trophy-art:' || parsed.hostname !== 'rpcs3') return null
  if (parsed.search !== '' || parsed.hash !== '' || parsed.username !== '' || parsed.port !== '')
    return null
  const segment = parsed.pathname.slice(1)
  return NP_COMM_ID.test(segment) ? segment : null
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}
