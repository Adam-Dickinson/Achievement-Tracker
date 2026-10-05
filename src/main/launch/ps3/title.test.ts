import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { readPs3Title } from './title'
import { buildIso, buildSfo, memorySource } from './test-helpers'

const SFO = buildSfo({ TITLE: "Demon's Souls", TITLE_ID: 'BLUS30443' })

function deps(files: Record<string, Uint8Array>) {
  return {
    files: { readBytes: vi.fn((path: string) => Promise.resolve(files[path] ?? null)) },
    openSource: vi.fn(() => memorySource(buildIso(SFO))),
  }
}

describe('readPs3Title', () => {
  it('reads the title from inside an iso', async () => {
    const d = deps({})

    await expect(readPs3Title('D:/G/game.ISO', d)).resolves.toEqual({
      title: "Demon's Souls",
      titleId: 'BLUS30443',
    })
    expect(d.openSource).toHaveBeenCalledWith('D:/G/game.ISO')
  })

  it('reads PS3_GAME/PARAM.SFO from a game folder', async () => {
    const d = deps({ [join('D:/G/folder', 'PS3_GAME', 'PARAM.SFO')]: SFO })

    await expect(readPs3Title('D:/G/folder', d)).resolves.toEqual({
      title: "Demon's Souls",
      titleId: 'BLUS30443',
    })
    expect(d.openSource).not.toHaveBeenCalled()
  })

  it('falls back to PARAM.SFO at the top of the folder', async () => {
    const d = deps({ [join('D:/G/folder', 'PARAM.SFO')]: SFO })

    await expect(readPs3Title('D:/G/folder', d)).resolves.toMatchObject({ titleId: 'BLUS30443' })
  })

  it('returns null when the folder has no PARAM.SFO', async () => {
    await expect(readPs3Title('D:/G/folder', deps({}))).resolves.toBeNull()
  })

  it('returns null when the iso file does not exist', async () => {
    const d = deps({})
    d.openSource.mockReturnValue({
      read: () => Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' })),
    })

    await expect(readPs3Title('D:/G/gone.iso', d)).resolves.toBeNull()
  })

  it('still rejects when the iso file cannot be opened for another reason', async () => {
    const d = deps({})
    d.openSource.mockReturnValue({
      read: () => Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' })),
    })

    await expect(readPs3Title('D:/G/locked.iso', d)).rejects.toThrow('denied')
  })
})
