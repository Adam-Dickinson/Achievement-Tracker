import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveTrophyArt } from './trophy-art'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const png = (): Uint8Array => new Uint8Array([...PNG, 1, 2, 3])
const DATA_DIR = join('D:', 'rpcs3')
const expected = (dataDir: string, userId: string, id: string): string =>
  join(dataDir, 'dev_hdd0', 'home', userId, 'trophy', id, 'ICON0.PNG')

function setup(
  files: Record<string, Uint8Array> = {},
  folders = [{ dataDir: DATA_DIR, userId: '00000001' }],
) {
  const readFile = vi.fn(async (path: string) => files[path] ?? null)
  const resolve = (url: string) => resolveTrophyArt(url, { rpcs3Folders: () => folders, readFile })
  return { readFile, resolve }
}

describe('resolveTrophyArt', () => {
  it('returns the icon bytes as a PNG for a valid id', async () => {
    const { resolve, readFile } = setup({ [expected(DATA_DIR, '00000001', 'NPWR00881_00')]: png() })

    const result = await resolve('trophy-art://rpcs3/NPWR00881_00')

    expect(result.status).toBe(200)
    expect(result.contentType).toBe('image/png')
    expect(result.body).toEqual(png())
    expect(readFile).toHaveBeenCalledWith(
      expected(DATA_DIR, '00000001', 'NPWR00881_00'),
      2 * 1024 * 1024,
    )
  })

  it('rejects an unknown host', async () => {
    const { resolve, readFile } = setup()

    expect((await resolve('trophy-art://other/NPWR00881_00')).status).toBe(404)
    expect(readFile).not.toHaveBeenCalled()
  })

  it.each([
    'trophy-art://rpcs3/..%2F..%2Fsecret',
    'trophy-art://rpcs3/NPWR00881_00/extra',
    'trophy-art://rpcs3/%2e%2e',
    'trophy-art://rpcs3/npwr00881_00',
    'trophy-art://rpcs3/NPWR00881_00?x=../..',
    'trophy-art://rpcs3/',
    'trophy-art://rpcs3/NPWR00881_00%2F..',
    'not a url',
  ])('rejects %s without reading anything', async (url) => {
    const { resolve, readFile } = setup({ [expected(DATA_DIR, '00000001', 'NPWR00881_00')]: png() })

    const result = await resolve(url)

    expect(result).toEqual({ status: 404, contentType: 'text/plain', body: null })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('rejects bytes that are not a PNG', async () => {
    const { resolve } = setup({
      [expected(DATA_DIR, '00000001', 'NPWR00881_00')]: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    })

    expect((await resolve('trophy-art://rpcs3/NPWR00881_00')).status).toBe(404)
  })

  it('rejects a file the reader refuses as too large', async () => {
    const { resolve } = setup()

    expect((await resolve('trophy-art://rpcs3/NPWR00881_00')).status).toBe(404)
  })

  it('returns 404 with no connected account', async () => {
    const { resolve, readFile } = setup({}, [])

    expect((await resolve('trophy-art://rpcs3/NPWR00881_00')).status).toBe(404)
    expect(readFile).not.toHaveBeenCalled()
  })

  it('finds the icon in a second account when the first lacks it', async () => {
    const other = join('E:', 'rpcs3b')
    const { resolve } = setup({ [expected(other, '00000002', 'NPWR00881_00')]: png() }, [
      { dataDir: DATA_DIR, userId: '00000001' },
      { dataDir: other, userId: '00000002' },
    ])

    expect((await resolve('trophy-art://rpcs3/NPWR00881_00')).status).toBe(200)
  })

  it('never throws when reading fails', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('boom'))

    const result = await resolveTrophyArt('trophy-art://rpcs3/NPWR00881_00', {
      rpcs3Folders: () => [{ dataDir: DATA_DIR, userId: '00000001' }],
      readFile,
    })

    expect(result.status).toBe(404)
  })
})
