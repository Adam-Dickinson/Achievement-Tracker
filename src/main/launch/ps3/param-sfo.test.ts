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
})
