import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { readIsoFile } from './iso9660'
import { buildIso, buildSfo, memorySource } from './test-helpers'

const SFO = buildSfo({ TITLE: "Demon's Souls", TITLE_ID: 'BLUS30443' })

describe('readIsoFile', () => {
  it('reads a file from a folder of the image', async () => {
    const bytes = await readIsoFile(memorySource(buildIso(SFO)), ['PS3_GAME', 'PARAM.SFO'])

    expect(bytes).toEqual(SFO)
  })

  it('matches names without regard to case', async () => {
    const bytes = await readIsoFile(memorySource(buildIso(SFO)), ['ps3_game', 'param.sfo'])

    expect(bytes).toEqual(SFO)
  })

  it('returns null when a part of the path is missing', async () => {
    const source = memorySource(buildIso(SFO))

    await expect(readIsoFile(source, ['PS3_GAME', 'NOPE.SFO'])).resolves.toBeNull()
    await expect(readIsoFile(source, ['MISSING', 'PARAM.SFO'])).resolves.toBeNull()
  })

  it('returns null for an empty path', async () => {
    await expect(readIsoFile(memorySource(buildIso(SFO)), [])).resolves.toBeNull()
  })

  it('refuses something that is not an ISO 9660 image', async () => {
    await expect(readIsoFile(memorySource(new Uint8Array(40_000)), ['A'])).rejects.toBeInstanceOf(
      ProviderError,
    )
  })

  it('refuses a file that is too large to be a PARAM.SFO', async () => {
    const image = buildIso(SFO)
    new DataView(image.buffer).setUint32(21 * 2048 + 10, 10_000_000, true)

    await expect(
      readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO']),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('refuses a directory record that runs past the directory', async () => {
    const image = buildIso(SFO)
    new DataView(image.buffer).setUint32(16 * 2048 + 166, 64, true)
    image[20 * 2048 + 48] = 200

    await expect(
      readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO']),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('refuses a record shorter than the fixed record header', async () => {
    const image = buildIso(SFO)
    image[20 * 2048 + 48] = 33
    image[20 * 2048 + 48 + 32] = 0

    await expect(
      readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO']),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('refuses a record whose name is longer than the record', async () => {
    const image = buildIso(SFO)
    image[20 * 2048 + 48 + 32] = 200

    await expect(
      readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO']),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('refuses a folder that is larger than a megabyte', async () => {
    const image = buildIso(SFO)
    new DataView(image.buffer).setUint32(16 * 2048 + 166, 2_000_000, true)

    await expect(
      readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO']),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('refuses an image that ends inside the volume descriptor', async () => {
    const image = buildIso(SFO).slice(0, 16 * 2048 + 100)

    await expect(
      readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO']),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('refuses an image that ends inside the file', async () => {
    const image = buildIso(SFO).slice(0, 22 * 2048 + SFO.length - 10)

    await expect(
      readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO']),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('lists entries that follow zero padding in a folder spanning several sectors', async () => {
    const source = buildIso(SFO)
    const image = new Uint8Array(source.length + 2 * 2048)
    image.set(source)
    image.set(source.subarray(20 * 2048, 20 * 2048 + 48), 24 * 2048)
    image.set(source.subarray(20 * 2048 + 48, 20 * 2048 + 90), 25 * 2048)
    const view = new DataView(image.buffer)
    view.setUint32(16 * 2048 + 158, 24, true)
    view.setUint32(16 * 2048 + 166, 4096, true)

    const bytes = await readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO'])

    expect(bytes).toEqual(SFO)
  })
})
