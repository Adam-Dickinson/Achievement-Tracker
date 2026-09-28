import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listFolder, readText } from './local-files'

let folder: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'local-files-'))
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

describe('readText', () => {
  it('reads a UTF-8 file, dropping a byte-order mark', async () => {
    writeFileSync(join(folder, 'a.xml'), Buffer.from([0xef, 0xbb, 0xbf, 0x3c, 0x61, 0x2f, 0x3e]))

    await expect(readText(join(folder, 'a.xml'), 100)).resolves.toBe('<a/>')
  })

  it('answers null for a missing file or folder', async () => {
    await expect(readText(join(folder, 'missing.xml'), 100)).resolves.toBeNull()
    await expect(readText(join(folder, 'no', 'such.xml'), 100)).resolves.toBeNull()
  })

  it('refuses a file larger than the limit as a parse error', async () => {
    writeFileSync(join(folder, 'big.xml'), 'x'.repeat(10))

    await expect(readText(join(folder, 'big.xml'), 5)).rejects.toMatchObject({ kind: 'parse' })
  })
})

describe('listFolder', () => {
  it('lists files and folders with their modified times', async () => {
    writeFileSync(join(folder, 'a.xml'), '')
    mkdirSync(join(folder, 'sub'))

    const entries = await listFolder(folder)

    expect(entries?.map(({ name, isDirectory }) => ({ name, isDirectory }))).toEqual(
      expect.arrayContaining([
        { name: 'a.xml', isDirectory: false },
        { name: 'sub', isDirectory: true },
      ]),
    )
    expect(entries?.[0]?.modifiedAt).toBeInstanceOf(Date)
  })

  it('answers null for a folder that does not exist', async () => {
    await expect(listFolder(join(folder, 'missing'))).resolves.toBeNull()
  })
})
