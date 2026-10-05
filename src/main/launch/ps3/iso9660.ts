import { ProviderError } from '@shared/errors'

export interface ByteSource {
  read(position: number, length: number): Promise<Uint8Array>
}

const SECTOR = 2048
const VOLUME_SECTOR = 16
const MAX_DIRECTORY_BYTES = 1_048_576
const MAX_FILE_BYTES = 262_144
const LATIN1 = new TextDecoder('latin1')

interface Entry {
  readonly name: string
  readonly lba: number
  readonly size: number
  readonly directory: boolean
}

function malformed(reason: string): ProviderError {
  return new ProviderError('parse', `RPCS3: ${reason}`)
}

function same(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase()
}

export async function readIsoFile(
  source: ByteSource,
  path: readonly string[],
): Promise<Uint8Array | null> {
  const folders = [...path]
  const file = folders.pop()
  if (file === undefined) return null

  const volume = await source.read(VOLUME_SECTOR * SECTOR, SECTOR)
  if (
    volume.length < SECTOR ||
    volume[0] !== 1 ||
    LATIN1.decode(volume.subarray(1, 6)) !== 'CD001'
  ) {
    throw malformed('the game file is not an ISO 9660 disc image')
  }
  const view = new DataView(volume.buffer, volume.byteOffset, volume.byteLength)
  let directory: Entry = {
    name: '',
    lba: view.getUint32(158, true),
    size: view.getUint32(166, true),
    directory: true,
  }

  for (const name of folders) {
    const next = (await listDirectory(source, directory)).find(
      (entry) => entry.directory && same(entry.name, name),
    )
    if (!next) return null
    directory = next
  }

  const entry = (await listDirectory(source, directory)).find(
    (item) => !item.directory && same(item.name, file),
  )
  if (!entry) return null
  if (entry.size > MAX_FILE_BYTES) throw malformed(`${file} is larger than ${MAX_FILE_BYTES} bytes`)
  return source.read(entry.lba * SECTOR, entry.size)
}

async function listDirectory(source: ByteSource, directory: Entry): Promise<Entry[]> {
  if (directory.size > MAX_DIRECTORY_BYTES) throw malformed('a disc image folder is too large')
  const bytes = await source.read(directory.lba * SECTOR, directory.size)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries: Entry[] = []
  let offset = 0
  while (offset < bytes.length) {
    const length = bytes[offset] ?? 0
    if (length === 0) {
      offset = (Math.floor(offset / SECTOR) + 1) * SECTOR
      continue
    }
    const nameLength = bytes[offset + 32] ?? 0
    if (length < 34 || offset + length > bytes.length || 33 + nameLength > length) {
      throw malformed('a disc image folder entry is damaged')
    }
    entries.push({
      name: LATIN1.decode(bytes.subarray(offset + 33, offset + 33 + nameLength)).replace(
        /;\d+$/,
        '',
      ),
      lba: view.getUint32(offset + 2, true),
      size: view.getUint32(offset + 10, true),
      directory: ((bytes[offset + 25] ?? 0) & 2) !== 0,
    })
    offset += length
  }
  return entries
}
