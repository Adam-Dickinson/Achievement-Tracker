import { join } from 'node:path'
import type { LocalFiles } from '../../providers/local-files'
import { readIsoFile, type ByteSource } from './iso9660'
import { parseParamSfo, type ParamSfo } from './param-sfo'

const MAX_SFO_BYTES = 262_144

export interface TitleDeps {
  readonly files: Pick<LocalFiles, 'readBytes'>
  readonly openSource: (path: string) => ByteSource
}

export async function readPs3Title(path: string, deps: TitleDeps): Promise<ParamSfo | null> {
  const bytes = path.toLowerCase().endsWith('.iso')
    ? await readFromIso(path, deps.openSource)
    : await readFromFolder(path, deps.files)
  return bytes === null ? null : parseParamSfo(bytes)
}

async function readFromIso(
  path: string,
  openSource: (path: string) => ByteSource,
): Promise<Uint8Array | null> {
  try {
    return await readIsoFile(openSource(path), ['PS3_GAME', 'PARAM.SFO'])
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}

async function readFromFolder(
  path: string,
  files: Pick<LocalFiles, 'readBytes'>,
): Promise<Uint8Array | null> {
  for (const parts of [['PS3_GAME', 'PARAM.SFO'], ['PARAM.SFO']]) {
    const bytes = await files.readBytes(join(path, ...parts), MAX_SFO_BYTES)
    if (bytes !== null) return bytes
  }
  return null
}
