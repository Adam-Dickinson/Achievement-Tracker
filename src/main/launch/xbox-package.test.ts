import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { parseGamingRoot, publisherId, readXboxPackage } from './xbox-package'

const INSTALL = 'tests/fixtures/xbox/install'
const BEAST = join(INSTALL, 'C/XboxGames/Beast of Reincarnation/Content')
const CALL_OF_DUTY = join(INSTALL, 'E/XboxGames/Call of Duty/Content')
const DLC_STUB = join(INSTALL, 'D/XboxGames/BO7 DLC01 Game Stub 01/Content')

const text = (folder: string, name: string): string =>
  readFileSync(join(folder, name), 'utf8').replace(/^\uFEFF/, '')

const manifestOf = (folder: string): string => text(folder, 'appxmanifest.xml')
const configOf = (folder: string): string => text(folder, 'MicrosoftGame.config')

function gamingRoot(...folders: string[]): Uint8Array {
  const header = Buffer.from([0x52, 0x47, 0x42, 0x58, folders.length, 0, 0, 0])
  return Buffer.concat([header, ...folders.map((folder) => Buffer.from(`${folder}\0`, 'utf16le'))])
}

function manifest(identity: string, applications: string, properties = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">
  ${identity}
  ${properties}
  <Applications>${applications}</Applications>
</Package>`
}

const IDENTITY = '<Identity Name="Studio.Game" Publisher="CN=Studio" Version="1.0.0.0" />'
const APPLICATION = '<Application Id="Game" Executable="GameLaunchHelper.exe" />'

function config(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><Game configVersion="1">${body}</Game>`
}

function thrown(run: () => unknown): ProviderError {
  try {
    run()
  } catch (error) {
    if (error instanceof ProviderError) return error
    throw error
  }
  throw new Error('expected a ProviderError')
}

describe('parseGamingRoot', () => {
  it('reads the games folder from a real .GamingRoot', () => {
    expect(parseGamingRoot(readFileSync(join(INSTALL, 'C/.GamingRoot')))).toEqual(['XboxGames'])
  })

  it('reads a folder name with a space', () => {
    expect(parseGamingRoot(readFileSync(join(INSTALL, 'F/.GamingRoot')))).toEqual(['Xbox Games'])
  })

  it('reads every folder listed', () => {
    expect(parseGamingRoot(gamingRoot('XboxGames', 'More Games'))).toEqual([
      'XboxGames',
      'More Games',
    ])
  })

  it('drops folders that would leave the drive root', () => {
    expect(
      parseGamingRoot(gamingRoot('..\\Windows', 'C:\\Windows', '\\Windows', 'a\\..\\b', 'Games')),
    ).toEqual(['Games'])
  })

  it('ignores a trailing odd byte', () => {
    const bytes = Buffer.concat([gamingRoot('XboxGames'), Buffer.from([0x41])])

    expect(parseGamingRoot(bytes)).toEqual(['XboxGames'])
  })

  it.each([
    ['too short', Buffer.from('RGB')],
    ['the wrong magic', Buffer.from('XXXX\x01\x00\x00\x00')],
  ])('throws a parse error for %s', (_, bytes) => {
    expect(thrown(() => parseGamingRoot(bytes)).kind).toBe('parse')
  })
})

describe('publisherId', () => {
  it.each([
    [
      'CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US',
      '8wekyb3d8bbwe',
    ],
    ['CN=0648CBA3-2CA9-485F-9562-7CF99EE24262', 'qj8vnfjar8dk2'],
    ['CN=07A9AC0F-5502-4D92-BA69-01D5D39D1E92', '5bkah9njm3e9g'],
  ])('hashes %s the way Windows does', (publisher, id) => {
    expect(publisherId(publisher)).toBe(id)
  })
})

describe('readXboxPackage', () => {
  it('reads a real game install', () => {
    expect(readXboxPackage(manifestOf(BEAST), configOf(BEAST), 'Beast of Reincarnation')).toEqual({
      titleId: '2059212977',
      title: 'Beast of Reincarnation',
      appUserModelId: 'Fictions.ProjectAibou_qj8vnfjar8dk2!AppBeastOfReincarnationShipping',
    })
  })

  it('reads a real install whose package has a resource id', () => {
    expect(
      readXboxPackage(manifestOf(CALL_OF_DUTY), configOf(CALL_OF_DUTY), 'Call of Duty'),
    ).toEqual({
      titleId: '2001700854',
      title: 'Call of Duty®',
      appUserModelId: '38985CA0.COREBase_5bkah9njm3e9g!codShip',
    })
  })

  it('skips an add-on package with no application', () => {
    expect(readXboxPackage(manifestOf(DLC_STUB), configOf(DLC_STUB), 'BO7 DLC01')).toBeNull()
  })

  it('skips a package whose title id is only in a comment', () => {
    const source = config('<!-- <TitleId>0A6D2730</TitleId> -->')

    expect(readXboxPackage(manifest(IDENTITY, APPLICATION), source, 'Game')).toBeNull()
  })

  it('takes the first application when there are several', () => {
    const applications = `${APPLICATION}<Application Id="Editor" Executable="Editor.exe" />`

    expect(
      readXboxPackage(manifest(IDENTITY, applications), config('<TitleId>1A</TitleId>'), 'Game')
        ?.appUserModelId,
    ).toMatch(/!Game$/)
  })

  it('falls back to the manifest display name when the config names a resource', () => {
    const source = config(
      '<ShellVisuals DefaultDisplayName="ms-resource:Name" /><TitleId>1A</TitleId>',
    )
    const properties = '<Properties><DisplayName>Real Name</DisplayName></Properties>'

    expect(
      readXboxPackage(manifest(IDENTITY, APPLICATION, properties), source, 'Folder')?.title,
    ).toBe('Real Name')
  })

  it('falls back to the folder name when neither file has a plain name', () => {
    const source = config(
      '<ShellVisuals DefaultDisplayName="ms-resource:Name" /><TitleId>1A</TitleId>',
    )
    const properties = '<Properties><DisplayName>ms-resource:Name</DisplayName></Properties>'

    expect(
      readXboxPackage(manifest(IDENTITY, APPLICATION, properties), source, 'Folder Name')?.title,
    ).toBe('Folder Name')
  })

  it.each([
    ['an application id with a path', '<Application Id="..\\cmd" />', IDENTITY, '1A'],
    ['a title id that is not hex', APPLICATION, IDENTITY, 'XYZ'],
    ['a title id that is too long', APPLICATION, IDENTITY, '123456789'],
    ['a missing identity', APPLICATION, '', '1A'],
    [
      'a package name with a space',
      APPLICATION,
      '<Identity Name="A B C" Publisher="CN=S" />',
      '1A',
    ],
    ['a missing publisher', APPLICATION, '<Identity Name="Studio.Game" />', '1A'],
  ])('throws a parse error for %s', (_, applications, identity, titleId) => {
    const run = () =>
      readXboxPackage(
        manifest(identity, applications),
        config(`<TitleId>${titleId}</TitleId>`),
        'G',
      )

    expect(thrown(run).kind).toBe('parse')
  })

  it('throws a parse error for files that are not a package and a game config', () => {
    expect(thrown(() => readXboxPackage('<Other />', config(''), 'G')).kind).toBe('parse')
    expect(
      thrown(() => readXboxPackage(manifest(IDENTITY, APPLICATION), '<Other />', 'G')).kind,
    ).toBe('parse')
  })

  it('throws a parse error for malformed XML', () => {
    expect(thrown(() => readXboxPackage('<Package>', config(''), 'G')).kind).toBe('parse')
  })
})
