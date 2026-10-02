import { ProviderError } from '@shared/errors'

export const MAX_TROPUSR_BYTES = 1024 * 1024

const MAGIC = 0x818f54ad
const HEADER_BYTES = 0x30
const TABLE_HEADER_BYTES = 0x20
const ENTRY_HEADER_BYTES = 0x10
const MAX_TABLES = 16
const MAX_ENTRIES = 4096
const STATE_TABLE = 6
const STATE_FIELDS_BYTES = 0x18
const TIMESTAMP_AT = 0x10
const RTC_EPOCH_OFFSET_MS = 62_135_596_800_000
const EARLIEST_UNLOCK_MS = Date.UTC(2006, 0, 1)
const LATEST_UNLOCK_MS = Date.UTC(2100, 0, 1)

export interface TropUsrUnlock {
  readonly trophyId: number
  readonly unlockedAt: Date | null
}

export interface TropUsr {
  readonly trophyCount: number
  readonly unlocks: readonly TropUsrUnlock[]
}

interface TableHeader {
  readonly type: number
  readonly entryBytes: number
  readonly entryCount: number
  readonly offset: number
}

export function parseTropUsr(bytes: Uint8Array): TropUsr {
  if (bytes.byteLength > MAX_TROPUSR_BYTES) fail('the trophy file is too large')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.byteLength < HEADER_BYTES || view.getUint32(0) !== MAGIC) {
    fail('this is not a trophy progress file')
  }

  const tableCount = view.getUint32(8)
  if (tableCount > MAX_TABLES || HEADER_BYTES + tableCount * TABLE_HEADER_BYTES > view.byteLength) {
    fail('the table list does not fit in the file')
  }

  const table = readTableHeaders(view, tableCount).find((header) => header.type === STATE_TABLE)
  if (!table) fail('the file has no trophy state table')
  return readStates(view, table)
}

function readTableHeaders(view: DataView, count: number): TableHeader[] {
  return Array.from({ length: count }, (_, index) => {
    const at = HEADER_BYTES + index * TABLE_HEADER_BYTES
    return {
      type: view.getUint32(at),
      entryBytes: view.getUint32(at + 4),
      entryCount: view.getUint32(at + 12),
      offset: Number(view.getBigUint64(at + 16)),
    }
  })
}

function readStates(view: DataView, table: TableHeader): TropUsr {
  const stride = ENTRY_HEADER_BYTES + table.entryBytes
  if (table.entryBytes < STATE_FIELDS_BYTES || table.entryCount > MAX_ENTRIES) {
    fail('the trophy state table has an unexpected shape')
  }
  if (table.offset + table.entryCount * stride > view.byteLength) {
    fail('the trophy state table runs past the end of the file')
  }

  const seen = new Set<number>()
  const unlocks: TropUsrUnlock[] = []
  for (let index = 0; index < table.entryCount; index++) {
    const data = table.offset + index * stride + ENTRY_HEADER_BYTES
    const trophyId = view.getUint32(data)
    if (seen.has(trophyId)) fail(`trophy ${trophyId} appears twice`)
    seen.add(trophyId)
    if (view.getUint32(data + 4) !== 0) {
      unlocks.push({ trophyId, unlockedAt: unlockTime(view.getBigUint64(data + TIMESTAMP_AT)) })
    }
  }
  return { trophyCount: table.entryCount, unlocks }
}

function unlockTime(ticks: bigint): Date | null {
  const ms = Number(ticks / 1000n) - RTC_EPOCH_OFFSET_MS
  return ms >= EARLIEST_UNLOCK_MS && ms < LATEST_UNLOCK_MS ? new Date(ms) : null
}

function fail(reason: string): never {
  throw new ProviderError('parse', `RPCS3: ${reason}`)
}
