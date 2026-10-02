import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const STATE_TABLE_AT = 0xeb0
const ENTRY_BYTES = 0x70
const ENTRY_HEADER_BYTES = 0x10
const STATE_AT = 4
const TIMESTAMP_AT = 0x10
const RTC_EPOCH_OFFSET_MS = 62_135_596_800_000n

export const FIXTURE_DATA_DIR = resolve('tests/fixtures/rpcs3/data')
export const DEMONS_SOULS = 'NPWR00881_00'
export const USER_ID = '00000001'
export const TROPUSR_FIXTURE = resolve(
  FIXTURE_DATA_DIR,
  'dev_hdd0',
  'home',
  USER_ID,
  'trophy',
  DEMONS_SOULS,
  'TROPUSR.DAT',
)

export function fixtureBytes(): Buffer {
  return readFileSync(TROPUSR_FIXTURE)
}

export function withUnlock(bytes: Uint8Array, trophyId: number, at: Date | null): Buffer {
  const copy = Buffer.from(bytes)
  const data = STATE_TABLE_AT + trophyId * ENTRY_BYTES + ENTRY_HEADER_BYTES
  copy.writeUInt32BE(1, data + STATE_AT)
  const ticks = at === null ? 0n : (BigInt(at.getTime()) + RTC_EPOCH_OFFSET_MS) * 1000n
  copy.writeBigUInt64BE(ticks, data + TIMESTAMP_AT)
  return copy
}
