import { ProviderError } from '@shared/errors'

export interface ParamSfo {
  readonly title: string
  readonly titleId: string | null
}

const HEADER_BYTES = 20
const ENTRY_BYTES = 16
const MAX_ENTRIES = 1024
const MAX_KEY_BYTES = 64
const MAX_VALUE_BYTES = 512
const UTF8 = new TextDecoder('utf-8')

function malformed(reason: string): ProviderError {
  return new ProviderError('parse', `RPCS3: PARAM.SFO ${reason}`)
}

function text(bytes: Uint8Array, start: number, limit: number): string {
  let end = start
  while (end < limit && bytes[end] !== 0) end++
  return UTF8.decode(bytes.subarray(start, end))
}

function key(bytes: Uint8Array, start: number, dataTable: number): string {
  const limit = Math.min(dataTable, start + MAX_KEY_BYTES, bytes.length)
  let end = start
  while (end < limit && bytes[end] !== 0) end++
  if (end >= limit) throw malformed('has an unterminated key')
  return UTF8.decode(bytes.subarray(start, end))
}

export function parseParamSfo(bytes: Uint8Array): ParamSfo {
  if (bytes.length < HEADER_BYTES) throw malformed('is too short')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, false) !== 0x00505346) throw malformed('has the wrong magic number')
  const keyTable = view.getUint32(8, true)
  const dataTable = view.getUint32(12, true)
  const count = view.getUint32(16, true)
  if (count > MAX_ENTRIES || HEADER_BYTES + count * ENTRY_BYTES > bytes.length) {
    throw malformed('has an entry count that does not fit the file')
  }

  const values = new Map<string, string>()
  for (let index = 0; index < count; index++) {
    const entry = HEADER_BYTES + index * ENTRY_BYTES
    const keyStart = keyTable + view.getUint16(entry, true)
    const dataStart = dataTable + view.getUint32(entry + 12, true)
    const length = view.getUint32(entry + 4, true)
    if (dataStart + length > bytes.length) throw malformed('has an entry outside the file')
    values.set(key(bytes, keyStart, dataTable), text(bytes, dataStart, dataStart + length))
  }

  const title = values.get('TITLE')
  if (!title) throw malformed('has no TITLE')
  const titleId = values.get('TITLE_ID') ?? null
  if (title.length > MAX_VALUE_BYTES || (titleId?.length ?? 0) > MAX_VALUE_BYTES) {
    throw malformed('has a title that is too long')
  }
  return { title, titleId }
}
