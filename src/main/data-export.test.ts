import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataExporter } from './data-export'
import { applyMigrations } from './store/migrate'
import {
  addPlatformGames,
  getPlatformGameByExternalId,
  upsertAccount,
  upsertAchievements,
} from './store/sync-store'
import type { RemoteAchievement, RemoteGame } from '@shared/models'

const NOW = new Date(2026, 9, 2, 12, 0)

function remoteGame(externalId: string): RemoteGame {
  return {
    ref: { externalId },
    title: 'Portal',
    iconUrl: null,
    coverUrl: null,
    lastPlayed: null,
    recentlyPlayed: false,
  }
}

function remoteAchievement(externalId: string): RemoteAchievement {
  return {
    externalId,
    name: externalId,
    description: 'Do the thing',
    iconUrl: null,
    iconLockedUrl: null,
    hidden: false,
    points: null,
    tier: null,
    globalPercent: null,
  }
}

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

  it('uses the local date in the suggested file name', async () => {
    chooseFile.mockResolvedValue(null)

    await new DataExporter({
      db,
      appInfo: () => ({ version: '0.1.0', schemaVersion: 8 }),
      chooseFile,
      writeFile,
      now: () => new Date(2026, 9, 2, 0, 30),
    }).run()

    expect(chooseFile).toHaveBeenCalledWith('trophy-locker-export-2026-10-02.json')
  })

  it('writes the export as JSON to the chosen path and reports the counts', async () => {
    const steam = upsertAccount(db, { platform: 'steam', externalId: 'acc', displayName: 'P' })
    const xbox = upsertAccount(db, { platform: 'xbox', externalId: 'xuid', displayName: 'P' })
    addPlatformGames(db, steam, [remoteGame('g1')])
    addPlatformGames(db, xbox, [remoteGame('x1')])
    const steamGame = getPlatformGameByExternalId(db, steam.id, 'g1')
    const xboxGame = getPlatformGameByExternalId(db, xbox.id, 'x1')
    upsertAchievements(db, steamGame.id, [remoteAchievement('a1'), remoteAchievement('a2')])
    upsertAchievements(db, xboxGame.id, [
      remoteAchievement('b1'),
      remoteAchievement('b2'),
      remoteAchievement('b3'),
    ])
    chooseFile.mockResolvedValue('C:\\out\\export.json')

    const result = await exporter().run()

    expect(result).toEqual({
      kind: 'saved',
      path: 'C:\\out\\export.json',
      games: 1,
      achievements: 5,
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
    expect(console.error).toHaveBeenCalled()
  })

  it('answers failed when the save dialog itself fails', async () => {
    chooseFile.mockRejectedValue(new Error('dialog broke'))

    const result = await exporter().run()

    expect(result.kind).toBe('failed')
    expect(writeFile).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('answers failed when building the export throws', async () => {
    chooseFile.mockResolvedValue('C:\\out\\export.json')
    db.close()

    const result = await exporter().run()

    expect(result.kind).toBe('failed')
    expect(writeFile).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})
