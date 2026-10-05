import { describe, expect, it } from 'vitest'
import { parseGamesYml } from './games-yml'

describe('parseGamesYml', () => {
  it('reads serial to path lines', () => {
    expect(
      parseGamesYml(
        "BLUS30443: D:/Emulators/PS3 Games/Demons Souls (USA)/Demon's Souls (USA).iso\n",
      ),
    ).toEqual([
      {
        serial: 'BLUS30443',
        path: "D:/Emulators/PS3 Games/Demons Souls (USA)/Demon's Souls (USA).iso",
      },
    ])
  })

  it('strips quotes and handles Windows line endings', () => {
    expect(parseGamesYml('BLES00001: "E:/Games/A B"\r\nNPUB30001: \'E:/Games/C\'\r\n')).toEqual([
      { serial: 'BLES00001', path: 'E:/Games/A B' },
      { serial: 'NPUB30001', path: 'E:/Games/C' },
    ])
  })

  it('skips comments, blanks and anything that is not a serial', () => {
    expect(parseGamesYml('# note\n\nnot a line\nC: D:/x\nBLUS30443:\n')).toEqual([])
  })
})
