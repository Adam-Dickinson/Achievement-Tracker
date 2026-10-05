import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchInstalled } from './match'
import { buildIso, buildSfo, memorySource } from './ps3/test-helpers'
import { createRpcs3InstallAdapter, type Rpcs3InstallDeps } from './rpcs3'

const ROOT = 'D:\\Emulators\\rpcs3'
const EXE = join(ROOT, 'rpcs3.exe')
const GAMES = join(ROOT, 'config', 'games.yml')
const SFO = buildSfo({ TITLE: "Demon's Souls", TITLE_ID: 'BLUS30443' })

function deps(over: Partial<Rpcs3InstallDeps> & { yml?: string | null } = {}): Rpcs3InstallDeps {
  const yml = over.yml === undefined ? 'BLUS30443: D:/Games/Demons Souls.iso\n' : over.yml
  return {
    dataDirs: () => [ROOT],
    exePath: () => Promise.resolve(EXE),
    files: {
      readText: (path) => Promise.resolve(path === GAMES ? yml : null),
      readBytes: () => Promise.resolve(null),
    },
    openSource: () => memorySource(buildIso(SFO)),
    ...over,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('createRpcs3InstallAdapter', () => {
  it('lists every game in games.yml with its real title and a program target', async () => {
    await expect(createRpcs3InstallAdapter(deps()).findInstalled()).resolves.toEqual([
      {
        platform: 'rpcs3',
        externalId: 'BLUS30443',
        title: "Demon's Souls",
        target: { kind: 'program', exe: EXE, args: ['--no-gui', 'D:/Games/Demons Souls.iso'] },
      },
    ])
  })

  it('lists nothing when the emulator program cannot be found', async () => {
    const adapter = createRpcs3InstallAdapter(deps({ exePath: () => Promise.resolve(null) }))

    await expect(adapter.findInstalled()).resolves.toEqual([])
  })

  it('lists nothing when there is no games.yml', async () => {
    await expect(createRpcs3InstallAdapter(deps({ yml: null })).findInstalled()).resolves.toEqual(
      [],
    )
  })

  it('lists nothing when no RPCS3 account is connected', async () => {
    await expect(
      createRpcs3InstallAdapter(deps({ dataDirs: () => [] })).findInstalled(),
    ).resolves.toEqual([])
  })

  it('skips a game whose title cannot be read and keeps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const adapter = createRpcs3InstallAdapter(
      deps({
        yml: 'BLUS30443: D:/Games/good.iso\nBLES00001: D:/Games/bad.iso\n',
        openSource: (path) =>
          path.endsWith('bad.iso')
            ? memorySource(new Uint8Array(40_000))
            : memorySource(buildIso(SFO)),
      }),
    )

    const result = await adapter.findInstalled()

    expect(result.map((game) => game.externalId)).toEqual(['BLUS30443'])
    expect(warn).toHaveBeenCalledOnce()
  })

  it('skips a game whose file is gone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const adapter = createRpcs3InstallAdapter(
      deps({ openSource: () => ({ read: () => Promise.reject(new Error('ENOENT')) }) }),
    )

    await expect(adapter.findInstalled()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledOnce()
  })

  it('links to the library game by title, since the library id is the trophy set', async () => {
    const installed = await createRpcs3InstallAdapter(deps()).findInstalled()

    const matches = matchInstalled(
      [
        {
          id: 7,
          gameId: 3,
          platform: 'rpcs3',
          externalId: 'NPWR00881_00',
          title: "Demon's Souls",
        },
      ],
      installed,
    )

    expect(matches).toHaveLength(1)
    expect(matches[0]?.target).toEqual(installed[0]?.target)
  })
})
