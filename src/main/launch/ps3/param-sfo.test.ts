import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { parseParamSfo } from './param-sfo'
import { buildSfo } from './test-helpers'

describe('parseParamSfo', () => {
  it('reads the title and serial', () => {
    expect(parseParamSfo(buildSfo({ TITLE: "Demon's Souls", TITLE_ID: 'BLUS30443' }))).toEqual({
      title: "Demon's Souls",
      titleId: 'BLUS30443',
    })
  })

  it("reads the real Demon's Souls file", () => {
    const bytes = readFileSync(join(__dirname, '../../../../tests/fixtures/rpcs3/PARAM.SFO'))

    expect(parseParamSfo(bytes)).toEqual({ title: "Demon's Souls", titleId: 'BLUS30443' })
  })

  it('allows a missing serial', () => {
    expect(parseParamSfo(buildSfo({ TITLE: 'Game' }))).toEqual({ title: 'Game', titleId: null })
  })

  it.each([
    ['too short', new Uint8Array(8)],
    ['wrong magic', new Uint8Array(64)],
    ['no title', buildSfo({ TITLE_ID: 'BLUS30443' })],
  ])('refuses a file that is %s', (_name, bytes) => {
    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })

  it('refuses an entry count that does not fit the file', () => {
    const bytes = buildSfo({ TITLE: 'Game' })
    new DataView(bytes.buffer).setUint32(16, 100_000, true)

    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })

  it('refuses a data offset outside the file', () => {
    const bytes = buildSfo({ TITLE: 'Game' })
    new DataView(bytes.buffer).setUint32(20 + 12, 1_000_000, true)

    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })

  it('refuses a key without a terminator', () => {
    const bytes = buildSfo({ TITLE: 'Game' })
    const keyOffset = new DataView(bytes.buffer).getUint32(8, true)
    bytes.fill(0x41, keyOffset, keyOffset + 6)

    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })

  it('refuses a key offset outside the file', () => {
    const bytes = buildSfo({ TITLE: 'Game' })
    new DataView(bytes.buffer).setUint16(20, 60_000, true)

    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })

  it('refuses an entry count that overruns a small file', () => {
    const bytes = buildSfo({ TITLE: 'Game' })
    new DataView(bytes.buffer).setUint32(16, 1000, true)

    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })

  it('refuses an entry whose length runs past the file', () => {
    const bytes = buildSfo({ TITLE: 'Game' })
    new DataView(bytes.buffer).setUint32(20 + 4, 1_000_000, true)

    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })

  it('refuses a title that is too long', () => {
    expect(() => parseParamSfo(buildSfo({ TITLE: 'A'.repeat(600) }))).toThrow(ProviderError)
  })

  it('refuses a serial that is too long', () => {
    expect(() => parseParamSfo(buildSfo({ TITLE: 'Game', TITLE_ID: 'B'.repeat(600) }))).toThrow(
      ProviderError,
    )
  })

  it('refuses a key that stays unterminated for longer than a key can be', () => {
    const bytes = new Uint8Array(500)
    const view = new DataView(bytes.buffer)
    bytes.set([0x00, 0x50, 0x53, 0x46], 0)
    view.setUint32(8, 36, true)
    view.setUint32(12, 400, true)
    view.setUint32(16, 1, true)
    view.setUint32(20 + 4, 5, true)
    bytes.fill(0x41, 36, 300)
    bytes.set(new TextEncoder().encode('Game'), 400)

    expect(() => parseParamSfo(bytes)).toThrow(/unterminated/)
  })
})
