import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { KnownGame } from '@shared/launch'
import { LOCAL_FILES } from '../providers/local-files'
import { matchInstalled } from './match'
import { createXboxInstallAdapter, type XboxInstallDeps } from './xbox'

const INSTALL = 'tests/fixtures/xbox/install'

function fixturePath(path: string): string {
  const [drive = '', ...rest] = path.split('\\')
  return join(INSTALL, drive.replace(':', ''), ...rest)
}

function fixtureFiles(over: Partial<XboxInstallDeps['files']> = {}): XboxInstallDeps['files'] {
  return {
    readText: (path, maxBytes) => LOCAL_FILES.readText(fixturePath(path), maxBytes),
    readBytes: (path, maxBytes) => LOCAL_FILES.readBytes(fixturePath(path), maxBytes),
    listFolder: (path) => LOCAL_FILES.listFolder(fixturePath(path)),
    ...over,
  }
}

const BEAST = {
  platform: 'xbox',
  externalId: '2059212977',
  title: 'Beast of Reincarnation',
  target: {
    kind: 'package',
    appUserModelId: 'Fictions.ProjectAibou_qj8vnfjar8dk2!AppBeastOfReincarnationShipping',
  },
}

const CALL_OF_DUTY = {
  platform: 'xbox',
  externalId: '2001700854',
  title: 'Call of Duty®',
  target: { kind: 'package', appUserModelId: '38985CA0.COREBase_5bkah9njm3e9g!codShip' },
}

describe('createXboxInstallAdapter', () => {
  let warn: MockInstance

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('lists the games in every drive’s Xbox games folder and skips add-on packages', async () => {
    const adapter = createXboxInstallAdapter({ files: fixtureFiles() })

    await expect(adapter.findInstalled()).resolves.toEqual([BEAST, CALL_OF_DUTY])
    expect(adapter.platform).toBe('xbox')
    expect(warn).not.toHaveBeenCalled()
  })

  it('reads .GamingRoot from each drive from C to Z', async () => {
    const readBytes = vi.fn<XboxInstallDeps['files']['readBytes']>(() => Promise.resolve(null))
    const adapter = createXboxInstallAdapter({ files: fixtureFiles({ readBytes }) })

    await expect(adapter.findInstalled()).resolves.toEqual([])
    expect(readBytes.mock.calls.map(([path]) => path)).toEqual(
      [...'CDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => `${letter}:\\.GamingRoot`),
    )
  })

  it('quietly skips a drive that cannot be read', async () => {
    const files = fixtureFiles()
    const adapter = createXboxInstallAdapter({
      files: {
        ...files,
        readBytes: (path, maxBytes) =>
          path.startsWith('C:')
            ? Promise.reject(new Error('EBUSY'))
            : files.readBytes(path, maxBytes),
      },
    })

    await expect(adapter.findInstalled()).resolves.toEqual([CALL_OF_DUTY])
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns and skips a drive whose .GamingRoot is malformed', async () => {
    const files = fixtureFiles()
    const adapter = createXboxInstallAdapter({
      files: {
        ...files,
        readBytes: (path, maxBytes) =>
          path.startsWith('E:')
            ? Promise.resolve(new Uint8Array([1, 2, 3]))
            : files.readBytes(path, maxBytes),
      },
    })

    await expect(adapter.findInstalled()).resolves.toEqual([BEAST])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('E:\\'))
  })

  it('warns and skips a games folder that cannot be listed', async () => {
    const files = fixtureFiles()
    const adapter = createXboxInstallAdapter({
      files: {
        ...files,
        listFolder: (path) =>
          path === 'C:\\XboxGames' ? Promise.reject(new Error('EPERM')) : files.listFolder(path),
      },
    })

    await expect(adapter.findInstalled()).resolves.toEqual([CALL_OF_DUTY])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('C:\\XboxGames'))
  })

  it('warns and skips one game with a malformed manifest, keeping the rest', async () => {
    const files = fixtureFiles()
    const adapter = createXboxInstallAdapter({
      files: {
        ...files,
        readText: (path, maxBytes) =>
          path.includes('Call of Duty') && path.endsWith('appxmanifest.xml')
            ? Promise.resolve('<Package>')
            : files.readText(path, maxBytes),
      },
    })

    await expect(adapter.findInstalled()).resolves.toEqual([BEAST])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Call of Duty'))
  })

  it('reads package files with a size limit', async () => {
    const readText = vi.fn(() => Promise.resolve(null))
    const adapter = createXboxInstallAdapter({ files: fixtureFiles({ readText }) })

    await adapter.findInstalled()

    expect(readText).toHaveBeenCalledWith(
      'C:\\XboxGames\\Beast of Reincarnation\\Content\\appxmanifest.xml',
      1_000_000,
    )
  })

  it('matches an install to the Xbox library entry by its title id', async () => {
    const adapter = createXboxInstallAdapter({ files: fixtureFiles() })
    const known: KnownGame[] = [
      { id: 7, gameId: 3, platform: 'xbox', externalId: '2001700854', title: 'Call of Duty: HQ' },
    ]

    const matches = matchInstalled(known, await adapter.findInstalled())

    expect(matches).toEqual([{ known: known[0], target: CALL_OF_DUTY.target }])
  })
})
