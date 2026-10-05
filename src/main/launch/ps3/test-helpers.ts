import type { ByteSource } from './iso9660'

const SECTOR = 2048

export function buildSfo(entries: Record<string, string>): Uint8Array {
  const keys = Object.keys(entries)
  const keyTable = new TextEncoder().encode(keys.map((key) => `${key}\0`).join(''))
  const values = keys.map((key) => new TextEncoder().encode(`${entries[key]}\0`))
  const keyOffset = 20 + keys.length * 16
  const dataOffset = keyOffset + keyTable.length
  const dataLength = values.reduce((total, value) => total + value.length, 0)
  const bytes = new Uint8Array(dataOffset + dataLength)
  const view = new DataView(bytes.buffer)
  bytes.set([0x00, 0x50, 0x53, 0x46], 0)
  view.setUint32(4, 0x0101, true)
  view.setUint32(8, keyOffset, true)
  view.setUint32(12, dataOffset, true)
  view.setUint32(16, keys.length, true)
  let keyPosition = 0
  let dataPosition = 0
  keys.forEach((key, index) => {
    const entry = 20 + index * 16
    const value = values[index] ?? new Uint8Array()
    view.setUint16(entry, keyPosition, true)
    view.setUint16(entry + 2, 0x0204, true)
    view.setUint32(entry + 4, value.length, true)
    view.setUint32(entry + 8, value.length, true)
    view.setUint32(entry + 12, dataPosition, true)
    bytes.set(value, dataOffset + dataPosition)
    keyPosition += key.length + 1
    dataPosition += value.length
  })
  bytes.set(keyTable, keyOffset)
  return bytes
}

function record(name: string, lba: number, size: number, directory: boolean): Uint8Array {
  const nameBytes = [...name].map((char) => char.charCodeAt(0))
  let length = 33 + nameBytes.length
  if (length % 2 === 1) length += 1
  const bytes = new Uint8Array(length)
  const view = new DataView(bytes.buffer)
  bytes[0] = length
  view.setUint32(2, lba, true)
  view.setUint32(10, size, true)
  bytes[25] = directory ? 2 : 0
  bytes[32] = nameBytes.length
  bytes.set(nameBytes, 33)
  return bytes
}

function sectorOf(records: Uint8Array[]): Uint8Array {
  const sector = new Uint8Array(SECTOR)
  let offset = 0
  for (const item of records) {
    sector.set(item, offset)
    offset += item.length
  }
  return sector
}

export function buildIso(sfo: Uint8Array): Uint8Array {
  const image = new Uint8Array(SECTOR * 24)
  const volume = new Uint8Array(SECTOR)
  volume[0] = 1
  volume.set([0x43, 0x44, 0x30, 0x30, 0x31], 1)
  volume.set(record('', 20, SECTOR, true).subarray(0, 34), 156)
  image.set(volume, 16 * SECTOR)
  image.set(
    sectorOf([record('PS3_DISC.SFB;1', 23, 10, false), record('PS3_GAME', 21, SECTOR, true)]),
    20 * SECTOR,
  )
  image.set(sectorOf([record('PARAM.SFO;1', 22, sfo.length, false)]), 21 * SECTOR)
  image.set(sfo, 22 * SECTOR)
  return image
}

export function memorySource(bytes: Uint8Array): ByteSource {
  return {
    read: (position, length) => Promise.resolve(bytes.slice(position, position + length)),
  }
}
