import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileByteSource } from './file-source'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tl-source-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('fileByteSource', () => {
  it('reads a slice from a position', async () => {
    const path = join(dir, 'a.bin')
    await writeFile(path, Buffer.from([1, 2, 3, 4, 5, 6]))

    const bytes = await fileByteSource(path).read(2, 3)

    expect([...bytes]).toEqual([3, 4, 5])
  })

  it('returns what exists when the file is shorter than asked', async () => {
    const path = join(dir, 'b.bin')
    await writeFile(path, Buffer.from([1, 2]))

    expect([...(await fileByteSource(path).read(1, 10))]).toEqual([2])
  })

  it('rejects when the file does not exist', async () => {
    await expect(fileByteSource(join(dir, 'missing.bin')).read(0, 1)).rejects.toThrow()
  })
})
