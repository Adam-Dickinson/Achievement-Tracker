import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  accountIdOf,
  ACTIVE_PROCESS_KEY,
  DEBOUNCE_MS,
  parseRegQuery,
  readFile,
  REGISTRY_POLL_MS,
  RUNNING_GAME_POLL_MS,
  type RegistryValue,
  statsFileAppId,
  statsFolder,
  STEAM_KEY,
  type SteamLocalDeps,
  watchSteamLocal,
} from './local'

const ACCOUNT_ID = '39734273'
const OTHER_ACCOUNT_ID = '12345'
const STEAM_PATH = 'c:/program files (x86)/steam'

describe('accountIdOf', () => {
  it('turns a SteamID64 into the 32-bit account ID used in file names', () => {
    expect(accountIdOf('76561197960265729')).toBe('1')
    expect(accountIdOf('76561198000000001')).toBe('39734273')
    expect(accountIdOf('76561202255233023')).toBe('4294967295')
  })

  it('gives null for anything that is not a SteamID64 of an individual account', () => {
    expect(accountIdOf('76561197960265728')).toBeNull()
    expect(accountIdOf('76561190000000001')).toBeNull()
    expect(accountIdOf('76561202255233024')).toBeNull()
    expect(accountIdOf('7656119800000000x')).toBeNull()
    expect(accountIdOf('')).toBeNull()
  })
})

describe('statsFileAppId', () => {
  it("gives the appid of this account's stats file", () => {
    expect(statsFileAppId(`UserGameStats_${ACCOUNT_ID}_1888930.bin`, ACCOUNT_ID)).toBe('1888930')
  })

  it("ignores another account's file, schema files and anything else", () => {
    expect(statsFileAppId(`UserGameStats_${OTHER_ACCOUNT_ID}_440.bin`, ACCOUNT_ID)).toBeNull()
    expect(statsFileAppId('UserGameStatsSchema_440.bin', ACCOUNT_ID)).toBeNull()
    expect(statsFileAppId(`UserGameStats_${ACCOUNT_ID}_440.bin.tmp`, ACCOUNT_ID)).toBeNull()
    expect(statsFileAppId('desktop.ini', ACCOUNT_ID)).toBeNull()
  })
})

describe('parseRegQuery', () => {
  const output = [
    '',
    'HKEY_CURRENT_USER\\Software\\Valve\\Steam',
    '    RunningAppID    REG_DWORD    0x1cd2a2',
    '    SteamPath    REG_SZ    c:/program files (x86)/steam',
    '    Empty Value    REG_SZ    ',
    '',
  ].join('\r\n')

  it('reads a DWORD as a number', () => {
    expect(parseRegQuery(output, 'RunningAppID')).toBe(1888930)
  })

  it('reads a string with spaces in it, ignoring the case of the name', () => {
    expect(parseRegQuery(output, 'steampath')).toBe(STEAM_PATH)
  })

  it('reads an empty string', () => {
    expect(parseRegQuery(output, 'Empty Value')).toBe('')
  })

  it('gives null when the value is missing', () => {
    expect(parseRegQuery(output, 'ActiveUser')).toBeNull()
    expect(parseRegQuery('', 'RunningAppID')).toBeNull()
  })
})

describe('watchSteamLocal', () => {
  let registry: Map<string, RegistryValue>
  let onFile: ((name: string) => void) | undefined
  let watchedPath: string | undefined
  let stopFolder: ReturnType<typeof vi.fn<() => void>>
  let onGame: ReturnType<typeof vi.fn<(appId: string) => void>>
  let deps: SteamLocalDeps

  beforeEach(() => {
    vi.useFakeTimers()
    registry = new Map<string, RegistryValue>([
      [`${STEAM_KEY}:SteamPath`, STEAM_PATH],
      [`${STEAM_KEY}:RunningAppID`, 0],
      [`${ACTIVE_PROCESS_KEY}:ActiveUser`, Number(ACCOUNT_ID)],
    ])
    onFile = undefined
    watchedPath = undefined
    stopFolder = vi.fn<() => void>()
    onGame = vi.fn<(appId: string) => void>()
    deps = {
      readRegistry: (key, name) => Promise.resolve(registry.get(`${key}:${name}`) ?? null),
      watchFolder: (path, listener) => {
        watchedPath = path
        onFile = listener
        return stopFolder
      },
      readFile: () => Promise.resolve(null),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setRunningGame(appId: number): void {
    registry.set(`${STEAM_KEY}:RunningAppID`, appId)
  }

  it("watches the stats folder inside Steam's install folder", async () => {
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    expect(watchedPath).toBe(join(STEAM_PATH, 'appcache', 'stats'))
    stop()
  })

  it("reports a game when this account's stats file for it changes", async () => {
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    onFile?.(`UserGameStats_${ACCOUNT_ID}_440.bin`)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(onGame).toHaveBeenCalledExactlyOnceWith('440')
    stop()
  })

  it('reports a burst of changes to one file once, after it settles', async () => {
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    onFile?.(`UserGameStats_${ACCOUNT_ID}_440.bin`)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 100)
    onFile?.(`UserGameStats_${ACCOUNT_ID}_440.bin`)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 100)
    expect(onGame).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(onGame).toHaveBeenCalledExactlyOnceWith('440')
    stop()
  })

  it('reports changes to two games separately', async () => {
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    onFile?.(`UserGameStats_${ACCOUNT_ID}_440.bin`)
    onFile?.(`UserGameStats_${ACCOUNT_ID}_570.bin`)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(onGame.mock.calls).toEqual([['440'], ['570']])
    stop()
  })

  it("ignores other accounts' files and the schema files", async () => {
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    onFile?.(`UserGameStats_${OTHER_ACCOUNT_ID}_440.bin`)
    onFile?.('UserGameStatsSchema_440.bin')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(onGame).not.toHaveBeenCalled()
    stop()
  })

  it('does not watch a folder when Steam is not installed', async () => {
    registry.delete(`${STEAM_KEY}:SteamPath`)
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    expect(watchedPath).toBeUndefined()
    stop()
  })

  it('reports the running game as soon as it starts, then every 30 seconds', async () => {
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    setRunningGame(1888930)
    await vi.advanceTimersByTimeAsync(REGISTRY_POLL_MS)
    expect(onGame).toHaveBeenCalledExactlyOnceWith('1888930')

    await vi.advanceTimersByTimeAsync(RUNNING_GAME_POLL_MS)
    expect(onGame).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(RUNNING_GAME_POLL_MS)
    expect(onGame).toHaveBeenCalledTimes(3)
    stop()
  })

  it('reports a game that is already running when watching starts', async () => {
    setRunningGame(440)
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    expect(onGame).toHaveBeenCalledExactlyOnceWith('440')
    stop()
  })

  it('stops reporting the game once it quits', async () => {
    setRunningGame(440)
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    setRunningGame(0)
    await vi.advanceTimersByTimeAsync(REGISTRY_POLL_MS)
    onGame.mockClear()
    await vi.advanceTimersByTimeAsync(RUNNING_GAME_POLL_MS * 3)

    expect(onGame).not.toHaveBeenCalled()
    stop()
  })

  it('switches to a new game started straight after another', async () => {
    setRunningGame(440)
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)

    setRunningGame(570)
    await vi.advanceTimersByTimeAsync(REGISTRY_POLL_MS)
    onGame.mockClear()
    await vi.advanceTimersByTimeAsync(RUNNING_GAME_POLL_MS)

    expect(onGame).toHaveBeenCalledExactlyOnceWith('570')
    stop()
  })

  it('leaves a game alone when another Steam account is signed in', async () => {
    registry.set(`${ACTIVE_PROCESS_KEY}:ActiveUser`, Number(OTHER_ACCOUNT_ID))
    setRunningGame(440)
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(RUNNING_GAME_POLL_MS)

    expect(onGame).not.toHaveBeenCalled()
    stop()
  })

  it('stop() closes the folder watch and ends every timer', async () => {
    setRunningGame(440)
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    await vi.advanceTimersByTimeAsync(0)
    onFile?.(`UserGameStats_${ACCOUNT_ID}_570.bin`)
    onGame.mockClear()

    stop()
    await vi.advanceTimersByTimeAsync(RUNNING_GAME_POLL_MS * 3)

    expect(stopFolder).toHaveBeenCalledOnce()
    expect(onGame).not.toHaveBeenCalled()
  })

  it('does not start watching the folder if stopped before the Steam folder is known', async () => {
    const stop = watchSteamLocal(deps, ACCOUNT_ID, onGame)
    stop()
    await vi.advanceTimersByTimeAsync(0)

    expect(watchedPath).toBeUndefined()
  })
})

describe('statsFolder', () => {
  it("is the stats folder inside Steam's install folder", () => {
    expect(statsFolder(STEAM_PATH)).toBe(join(STEAM_PATH, 'appcache', 'stats'))
  })

  it.each([null, '', 1])('is null without a Steam folder (%s)', (value) => {
    expect(statsFolder(value)).toBeNull()
  })
})

describe('readFile', () => {
  let folder: string

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'steam-stats-'))
  })

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true })
  })

  it('reads a file up to the size limit', async () => {
    writeFileSync(join(folder, 'stats.bin'), Buffer.of(1, 2, 3))

    await expect(readFile(join(folder, 'stats.bin'), 3)).resolves.toEqual(Buffer.of(1, 2, 3))
  })

  it('gives null for a missing file', async () => {
    await expect(readFile(join(folder, 'missing.bin'), 3)).resolves.toBeNull()
  })

  it('refuses a file larger than the limit as a parse error', async () => {
    writeFileSync(join(folder, 'big.bin'), Buffer.alloc(4))

    await expect(readFile(join(folder, 'big.bin'), 3)).rejects.toMatchObject({ kind: 'parse' })
  })
})
