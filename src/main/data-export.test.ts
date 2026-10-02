import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataExporter } from './data-export'
import { applyMigrations } from './store/migrate'
import { addPlatformGames, upsertAccount } from './store/sync-store'

const NOW = new Date('2026-10-02T12:00:00.000Z')

let db: DatabaseSync
const chooseFile = vi.fn<(defaultName: string) => Promise<string | null>>()
const writeFile = vi.fn<(path: string, text: string) => Promise<void>>()

function exporter(): DataExporter {
  return new DataExporter({
    db,
    appInfo: () => ({ version: '0.1.0', schemaVersion: 8 }),
    chooseFile,
    writeFile,
    now: () => NOW,
  })
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  applyMigrations(db)
  chooseFile.mockReset()
  writeFile.mockReset()
  writeFile.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DataExporter', () => {
  it('suggests a file name with the date', async () => {
    chooseFile.mockResolvedValue(null)

    await exporter().run()

    expect(chooseFile).toHaveBeenCalledWith('trophy-locker-export-2026-10-02.json')
  })

  it('writes nothing when the dialog is cancelled', async () => {
    chooseFile.mockResolvedValue(null)

    await expect(exporter().run()).resolves.toEqual({ kind: 'cancelled' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('writes the export as JSON to the chosen path and reports the counts', async () => {
    const account = upsertAccount(db, { platform: 'steam', externalId: 'acc', displayName: 'P' })
    addPlatformGames(db, account, [
      {
        ref: { externalId: 'g1' },
        title: 'Portal',
        iconUrl: null,
        coverUrl: null,
        lastPlayed: null,
        recentlyPlayed: false,
      },
    ])
    chooseFile.mockResolvedValue('C:\\out\\export.json')

    const result = await exporter().run()

    expect(result).toEqual({
      kind: 'saved',
      path: 'C:\\out\\export.json',
      games: 1,
      achievements: 0,
    })
    const [path, text] = writeFile.mock.calls[0] ?? []
    expect(path).toBe('C:\\out\\export.json')
    const written = JSON.parse(text ?? '') as { format: number; games: { title: string }[] }
    expect(written.format).toBe(1)
    expect(written.games.map((game) => game.title)).toEqual(['Portal'])
  })

  it('answers failed, not an exception, when the file cannot be written', async () => {
    chooseFile.mockResolvedValue('C:\\out\\export.json')
    writeFile.mockRejectedValue(new Error('EACCES'))

    const result = await exporter().run()

    expect(result).toEqual({
      kind: 'failed',
      message: 'Could not save the file. Check that the folder can be written to and try again.',
    })
  })
})
