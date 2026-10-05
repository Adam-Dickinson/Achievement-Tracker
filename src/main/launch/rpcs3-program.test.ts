import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findRpcs3Program } from './rpcs3-program'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rpcs3-program-'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('findRpcs3Program', () => {
  it('returns the program beside the data folder', async () => {
    writeFileSync(join(dir, 'rpcs3.exe'), '')

    await expect(findRpcs3Program(dir)).resolves.toBe(join(dir, 'rpcs3.exe'))
  })

  it('returns null when the program is absent', async () => {
    await expect(findRpcs3Program(dir)).resolves.toBeNull()
  })
})
