import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createSteamInstallAdapter, type SteamInstallDeps } from './steam'

const STEAM = 'c:/program files (x86)/steam'
const LIBRARY = 'D:\\SteamLibrary'

const LIBRARY_FOLDERS = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"c:\\\\program files (x86)\\\\steam"
\t}
\t"1"
\t{
\t\t"path"\t\t"D:\\\\SteamLibrary"
\t}
}`

const manifest = (appid: string, name: string, flags: string): string =>
  `"AppState"
{
\t"appid"\t\t"${appid}"
\t"name"\t\t"${name}"
\t"StateFlags"\t\t"${flags}"
}`

function deps(files: Record<string, string>, folders: Record<string, string[]>): SteamInstallDeps {
  return {
    readRegistry: (_key, name) => Promise.resolve(name === 'SteamPath' ? STEAM : null),
    files: {
      readText: (path) => Promise.resolve(files[path] ?? null),
      listFolder: (path) =>
        Promise.resolve(
          folders[path]
            ? folders[path].map((name) => ({ name, isDirectory: false, modifiedAt: new Date(0) }))
            : null,
        ),
    },
  }
}

describe('createSteamInstallAdapter', () => {
  let warn: MockInstance

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('lists fully installed games across every library folder', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        {
          [join(STEAM, 'steamapps', 'libraryfolders.vdf')]: LIBRARY_FOLDERS,
          [join(STEAM, 'steamapps', 'appmanifest_220.acf')]: manifest('220', 'Half-Life 2', '4'),
          [join(LIBRARY, 'steamapps', 'appmanifest_1245620.acf')]: manifest(
            '1245620',
            'ELDEN RING',
            '4',
          ),
        },
        {
          [join(STEAM, 'steamapps')]: ['appmanifest_220.acf', 'libraryfolders.vdf'],
          [join(LIBRARY, 'steamapps')]: ['appmanifest_1245620.acf', 'notes.txt'],
        },
      ),
    )

    await expect(adapter.findInstalled()).resolves.toEqual([
      {
        platform: 'steam',
        externalId: '220',
        title: 'Half-Life 2',
        target: { kind: 'uri', uri: 'steam://rungameid/220' },
      },
      {
        platform: 'steam',
        externalId: '1245620',
        title: 'ELDEN RING',
        target: { kind: 'uri', uri: 'steam://rungameid/1245620' },
      },
    ])
  })

  it('skips games that are not fully installed yet', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        {
          [join(STEAM, 'steamapps', 'libraryfolders.vdf')]: LIBRARY_FOLDERS,
          [join(STEAM, 'steamapps', 'appmanifest_10.acf')]: manifest('10', 'Downloading', '1026'),
          [join(STEAM, 'steamapps', 'appmanifest_20.acf')]: manifest('20', 'Updating', '6'),
        },
        { [join(STEAM, 'steamapps')]: ['appmanifest_10.acf', 'appmanifest_20.acf'] },
      ),
    )

    const result = await adapter.findInstalled()

    expect(result.map((game) => game.externalId)).toEqual(['20'])
  })

  it('returns nothing when Steam is not installed', async () => {
    const adapter = createSteamInstallAdapter({
      readRegistry: () => Promise.resolve(null),
      files: { readText: () => Promise.resolve(null), listFolder: () => Promise.resolve(null) },
    })

    await expect(adapter.findInstalled()).resolves.toEqual([])
  })

  it('still finds the main library when libraryfolders.vdf is missing', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        { [join(STEAM, 'steamapps', 'appmanifest_220.acf')]: manifest('220', 'Half-Life 2', '4') },
        { [join(STEAM, 'steamapps')]: ['appmanifest_220.acf'] },
      ),
    )

    await expect(adapter.findInstalled()).resolves.toHaveLength(1)
  })

  it('skips a manifest it cannot read and carries on', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        {
          [join(STEAM, 'steamapps', 'appmanifest_1.acf')]: '"AppState" {',
          [join(STEAM, 'steamapps', 'appmanifest_220.acf')]: manifest('220', 'Half-Life 2', '4'),
        },
        { [join(STEAM, 'steamapps')]: ['appmanifest_1.acf', 'appmanifest_220.acf'] },
      ),
    )

    const result = await adapter.findInstalled()

    expect(result.map((game) => game.externalId)).toEqual(['220'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('falls back to the main library when libraryfolders.vdf is malformed', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        {
          [join(STEAM, 'steamapps', 'libraryfolders.vdf')]: '"libraryfolders" {',
          [join(STEAM, 'steamapps', 'appmanifest_220.acf')]: manifest('220', 'Half-Life 2', '4'),
        },
        { [join(STEAM, 'steamapps')]: ['appmanifest_220.acf'] },
      ),
    )

    await expect(adapter.findInstalled()).resolves.toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('skips one unreadable library and still lists the others', async () => {
    const base = deps(
      {
        [join(STEAM, 'steamapps', 'libraryfolders.vdf')]: LIBRARY_FOLDERS,
        [join(LIBRARY, 'steamapps', 'appmanifest_1245620.acf')]: manifest(
          '1245620',
          'ELDEN RING',
          '4',
        ),
      },
      { [join(LIBRARY, 'steamapps')]: ['appmanifest_1245620.acf'] },
    )
    const adapter = createSteamInstallAdapter({
      ...base,
      files: {
        ...base.files,
        listFolder: (path) =>
          path === join(STEAM, 'steamapps')
            ? Promise.reject(new Error('EACCES'))
            : base.files.listFolder(path),
      },
    })

    const result = await adapter.findInstalled()

    expect(result.map((game) => game.externalId)).toEqual(['1245620'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EACCES'))
  })

  it('ignores a manifest whose appid is not a number', async () => {
    const adapter = createSteamInstallAdapter(
      deps(
        {
          [join(STEAM, 'steamapps', 'appmanifest_9.acf')]: manifest('9; calc', 'Bad', '4'),
        },
        { [join(STEAM, 'steamapps')]: ['appmanifest_9.acf'] },
      ),
    )

    await expect(adapter.findInstalled()).resolves.toEqual([])
  })
})
