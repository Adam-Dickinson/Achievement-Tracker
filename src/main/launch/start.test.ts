import { describe, expect, it, vi } from 'vitest'
import { isAppUserModelId, isLaunchUri, startTarget, type StartDeps } from './start'

const XBOX_GAME = '38985CA0.COREBase_5bkah9njm3e9g!codShip'

function deps(over: Partial<StartDeps> = {}): StartDeps {
  return {
    openExternal: vi.fn().mockResolvedValue(undefined),
    spawnProgram: vi.fn().mockResolvedValue(undefined),
    openPackage: vi.fn().mockResolvedValue(undefined),
    fileExists: vi.fn().mockResolvedValue(true),
    ...over,
  }
}

describe('isLaunchUri', () => {
  it.each([
    'steam://rungameid/220',
    'uplay://launch/1081/0',
    'com.epicgames.launcher://apps/abc?action=launch&silent=true',
    'origin2://game/launch/?offerIds=123',
  ])('allows %s', (uri) => expect(isLaunchUri(uri)).toBe(true))

  it.each([
    'https://example.com',
    'file:///C:/Windows/System32/cmd.exe',
    'javascript:alert(1)',
    'cmd.exe /c calc',
    'steam://rungameid/220 --evil',
    '',
  ])('refuses %s', (uri) => expect(isLaunchUri(uri)).toBe(false))
})

describe('isAppUserModelId', () => {
  it.each([
    XBOX_GAME,
    'Fictions.ProjectAibou_qj8vnfjar8dk2!AppBeastOfReincarnationShipping',
    'Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft',
  ])('allows %s', (id) => expect(isAppUserModelId(id)).toBe(true))

  it.each([
    '',
    '38985CA0.COREBase_5bkah9njm3e9g',
    '38985CA0.COREBase!codShip',
    '38985CA0.COREBase_5bkah9njm3e9g!..\\..\\cmd',
    '38985CA0.COREBase_5bkah9njm3e9g!cod Ship',
    '38985CA0.COREBase_5bkah9njm3e9g!1cod',
    'C:\\Windows_5bkah9njm3e9g!codShip',
    '38985CA0.COREBase_5bkah9njm3e9u!codShip',
    `38985CA0.COREBase_5bkah9njm3e9g!${'a'.repeat(65)}`,
  ])('refuses %s', (id) => expect(isAppUserModelId(id)).toBe(false))
})

describe('startTarget', () => {
  it('opens an allowed uri', async () => {
    const d = deps()

    await expect(startTarget({ kind: 'uri', uri: 'steam://rungameid/220' }, d)).resolves.toEqual({
      ok: true,
    })
    expect(d.openExternal).toHaveBeenCalledWith('steam://rungameid/220')
  })

  it('refuses a uri that is not allowed', async () => {
    const d = deps()

    const result = await startTarget({ kind: 'uri', uri: 'https://example.com' }, d)

    expect(result.ok).toBe(false)
    expect(d.openExternal).not.toHaveBeenCalled()
  })

  it('reports a launcher that could not be opened', async () => {
    const d = deps({ openExternal: vi.fn().mockRejectedValue(new Error('no handler')) })

    await expect(startTarget({ kind: 'uri', uri: 'steam://rungameid/220' }, d)).resolves.toEqual({
      ok: false,
      reason: 'Could not open the launcher.',
    })
  })

  it('starts a program with its arguments as an array', async () => {
    const d = deps()

    const result = await startTarget(
      { kind: 'program', exe: 'D:\\Emulators\\rpcs3.exe', args: ['D:\\Games\\game.iso'] },
      d,
    )

    expect(result).toEqual({ ok: true })
    expect(d.spawnProgram).toHaveBeenCalledWith('D:\\Emulators\\rpcs3.exe', ['D:\\Games\\game.iso'])
  })

  it('refuses a program that is not an exe', async () => {
    const d = deps()

    const result = await startTarget({ kind: 'program', exe: 'D:\\x\\script.bat', args: [] }, d)

    expect(result.ok).toBe(false)
    expect(d.spawnProgram).not.toHaveBeenCalled()
  })

  it('reports a program that no longer exists', async () => {
    const d = deps({ fileExists: vi.fn().mockResolvedValue(false) })

    await expect(
      startTarget({ kind: 'program', exe: 'D:\\gone\\rpcs3.exe', args: [] }, d),
    ).resolves.toEqual({ ok: false, reason: 'The program was not found.' })
    expect(d.spawnProgram).not.toHaveBeenCalled()
  })

  it('reports a program that failed to start', async () => {
    const d = deps({ spawnProgram: vi.fn().mockRejectedValue(new Error('EACCES')) })

    await expect(
      startTarget({ kind: 'program', exe: 'D:\\x\\rpcs3.exe', args: [] }, d),
    ).resolves.toEqual({ ok: false, reason: 'The program could not be started.' })
  })

  it('refuses a program path that is not absolute', async () => {
    const d = deps()

    const result = await startTarget({ kind: 'program', exe: 'rpcs3.exe', args: [] }, d)

    expect(result.ok).toBe(false)
    expect(d.fileExists).not.toHaveBeenCalled()
    expect(d.spawnProgram).not.toHaveBeenCalled()
  })

  it('allows an upper case .EXE', async () => {
    const d = deps()

    await expect(
      startTarget({ kind: 'program', exe: 'D:\\Emu\\RPCS3.EXE', args: [] }, d),
    ).resolves.toEqual({ ok: true })
  })

  it('opens an installed app package by its app id', async () => {
    const d = deps()

    await expect(startTarget({ kind: 'package', appUserModelId: XBOX_GAME }, d)).resolves.toEqual({
      ok: true,
    })
    expect(d.openPackage).toHaveBeenCalledWith(XBOX_GAME)
    expect(d.openExternal).not.toHaveBeenCalled()
    expect(d.spawnProgram).not.toHaveBeenCalled()
  })

  it('refuses a package app id that is not well formed', async () => {
    const d = deps()

    const result = await startTarget({ kind: 'package', appUserModelId: 'calc.exe' }, d)

    expect(result).toEqual({ ok: false, reason: 'That game cannot be started from here.' })
    expect(d.openPackage).not.toHaveBeenCalled()
  })

  it('reports a package that failed to start', async () => {
    const d = deps({ openPackage: vi.fn().mockRejectedValue(new Error('ENOENT')) })

    await expect(startTarget({ kind: 'package', appUserModelId: XBOX_GAME }, d)).resolves.toEqual({
      ok: false,
      reason: 'The game could not be started.',
    })
  })
})
