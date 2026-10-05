import { win32 } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchInstalled } from './match'
import { buildIso, buildSfo, memorySource } from './ps3/test-helpers'
import { createRpcs3InstallAdapter, type Rpcs3InstallDeps } from './rpcs3'

const ROOT = 'D:\\Emulators\\rpcs3'
const EXE = win32.join(ROOT, 'rpcs3.exe')
const GAMES = win32.join(ROOT, 'config', 'games.yml')
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

  it('skips paths that are not absolute and never opens them', async () => {
    const openSource = vi.fn(() => memorySource(buildIso(SFO)))
    const readBytes = vi.fn(() => Promise.resolve(null))
    const adapter = createRpcs3InstallAdapter(
      deps({
        yml: 'BLUS30443: --installfw\nBLES00001: games/x.iso\n',
        openSource,
        files: {
          readText: () => Promise.resolve('BLUS30443: --installfw\nBLES00001: games/x.iso\n'),
          readBytes,
        },
      }),
    )

    await expect(adapter.findInstalled()).resolves.toEqual([])
    expect(openSource).not.toHaveBeenCalled()
    expect(readBytes).not.toHaveBeenCalled()
  })

  it('lists a game stored as an absolute folder', async () => {
    const adapter = createRpcs3InstallAdapter(
      deps({
        yml: 'BLUS30443: D:/Games/Demons Souls\n',
        files: {
          readText: () => Promise.resolve('BLUS30443: D:/Games/Demons Souls\n'),
          readBytes: (path) => Promise.resolve(path.endsWith('PARAM.SFO') ? SFO : null),
        },
      }),
    )

    const result = await adapter.findInstalled()

    expect(result.map((game) => game.title)).toEqual(["Demon's Souls"])
  })

  it('skips a title that never finishes reading after 10 seconds and keeps the others', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const adapter = createRpcs3InstallAdapter(
      deps({
        yml: 'BLUS30443: D:/Games/good.iso\nBLES00001: D:/Games/stuck.iso\n',
        openSource: (path) =>
          path.endsWith('stuck.iso')
            ? { read: () => new Promise<Uint8Array>(() => undefined) }
            : memorySource(buildIso(SFO)),
      }),
    )

    const pending = adapter.findInstalled()
    await vi.advanceTimersByTimeAsync(10_000)
    const result = await pending

    expect(result.map((game) => game.externalId)).toEqual(['BLUS30443'])
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('BLES00001')
    vi.useRealTimers()
  })

  it('reads at most four titles at a time', async () => {
    let inFlight = 0
    let peak = 0
    const yml = Array.from({ length: 10 }, (_, n) => `BLUS3000${n}: D:/Games/g${n}.iso`).join('\n')
    const adapter = createRpcs3InstallAdapter(
      deps({
        yml,
        openSource: () => ({
          read: async (offset, length) => {
            inFlight++
            peak = Math.max(peak, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 1))
            inFlight--
            return memorySource(buildIso(SFO)).read(offset, length)
          },
        }),
      }),
    )

    const result = await adapter.findInstalled()

    expect(result).toHaveLength(10)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(4)
  })

  it('reads each install once even when several users share it', async () => {
    const readText = vi.fn((path: string) =>
      Promise.resolve(path === GAMES ? 'BLUS30443: D:/Games/a.iso\n' : null),
    )
    const adapter = createRpcs3InstallAdapter(
      deps({
        dataDirs: () => [ROOT, ROOT, ROOT.toLowerCase()],
        files: { readText, readBytes: () => Promise.resolve(null) },
      }),
    )

    const result = await adapter.findInstalled()

    expect(result).toHaveLength(1)
    expect(readText).toHaveBeenCalledOnce()
  })

  it('does not read games.yml when the program is missing', async () => {
    const readText = vi.fn(() => Promise.resolve(null))
    const adapter = createRpcs3InstallAdapter(
      deps({
        exePath: () => Promise.resolve(null),
        files: { readText, readBytes: () => Promise.resolve(null) },
      }),
    )

    await adapter.findInstalled()

    expect(readText).not.toHaveBeenCalled()
  })

  it('keeps both entries when a serial appears twice and still matches', async () => {
    const yml = 'BLUS30443: D:/Games/a.iso\nBLUS30443: D:/Games/b.iso\n'
    const installed = await createRpcs3InstallAdapter(deps({ yml })).findInstalled()

    const matches = matchInstalled(
      [{ id: 7, gameId: 3, platform: 'rpcs3', externalId: 'NPWR00881_00', title: "Demon's Souls" }],
      installed,
    )

    expect(installed).toHaveLength(2)
    expect(matches).toHaveLength(1)
  })
})
