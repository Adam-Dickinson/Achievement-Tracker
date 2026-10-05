import { cpSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '@shared/errors'
import type { AccountCredentials, UnlockEvent } from '@shared/models'
import { Secret } from '@shared/secret'
import { InMemorySecretStore } from '@shared/secret-store'
import { applyMigrations } from '../../store/migrate'
import { upsertAccount } from '../../store/sync-store'
import { Scheduler } from '../../sync/scheduler'
import { LOCAL_FILES, type LocalFiles } from '../local-files'
import { Rpcs3Provider } from '.'
import {
  accountExternalId,
  DEBOUNCE_MS,
  dataDirOf,
  defaultDataDirs,
  listUsers,
  parseAccountExternalId,
  RETRY_READ_MS,
  watchUserTrophies,
} from './local'
import { DEMONS_SOULS, FIXTURE_DATA_DIR, fixtureBytes, USER_ID, withUnlock } from './test-helpers'

const NOW = new Date('2026-10-02T18:00:00.000Z')

let dataDir: string

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'rpcs3-'))
  cpSync(FIXTURE_DATA_DIR, dataDir, { recursive: true })
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

function credentials(userId = USER_ID, dir = dataDir): AccountCredentials {
  return {
    platform: 'rpcs3',
    externalId: accountExternalId({ dataDir: dir, userId }),
    secret: null,
  }
}

function credentialsAccount() {
  return parseAccountExternalId(credentials().externalId)
}

function provider(files: LocalFiles = LOCAL_FILES): Rpcs3Provider {
  return new Rpcs3Provider(files, { now: () => NOW, delay: () => Promise.resolve() })
}

async function thrown(run: () => Promise<unknown>): Promise<ProviderError> {
  try {
    await run()
  } catch (err) {
    if (err instanceof ProviderError) return err
    throw err
  }
  throw new Error('expected a ProviderError')
}

function gameDir(): string {
  return join(dataDir, 'dev_hdd0', 'home', USER_ID, 'trophy', DEMONS_SOULS)
}

function progressFile(): string {
  return join(gameDir(), 'TROPUSR.DAT')
}

function earn(trophyId: number, at: Date): void {
  writeFileSync(progressFile(), withUnlock(fixtureBytes(), trophyId, at))
}

describe('RPCS3 account ids', () => {
  it('round-trips an install folder and user', () => {
    const account = { dataDir: 'D:\\Emulators\\rpcs3', userId: '00000001' }

    expect(parseAccountExternalId(accountExternalId(account))).toEqual(account)
  })

  it.each(['D:\\rpcs3', 'D:\\rpcs3|', '|00000001', 'D:\\rpcs3|me', 'D:\\rpcs3|1'])(
    'rejects %s',
    (externalId) => {
      expect(() => parseAccountExternalId(externalId)).toThrow(ProviderError)
    },
  )

  it('knows where RPCS3 keeps its data off Windows, and has no fixed place on Windows', () => {
    expect(defaultDataDirs('linux', '/home/p')).toEqual([join('/home/p', '.config', 'rpcs3')])
    expect(defaultDataDirs('darwin', '/Users/p')).toEqual([
      join('/Users/p', 'Library', 'Application Support', 'rpcs3'),
    ])
    expect(defaultDataDirs('win32', 'C:\\Users\\p')).toEqual([])
  })
})

describe('dataDirOf', () => {
  it('returns the install folder of an account id', () => {
    const id = accountExternalId({ dataDir: 'D:\\Emu\\rpcs3', userId: '00000001' })

    expect(dataDirOf(id)).toBe('D:\\Emu\\rpcs3')
  })

  it('returns null for a malformed id', () => {
    expect(dataDirOf('garbage')).toBeNull()
  })

  it('returns null when the user id is not eight digits', () => {
    expect(dataDirOf('D:\\x|abc')).toBeNull()
  })

  it('round-trips a folder that contains the separator', () => {
    const dataDir = 'D:\\Emu|new\\rpcs3'

    expect(dataDirOf(accountExternalId({ dataDir, userId: '00000001' }))).toBe(dataDir)
  })
})

describe('listUsers', () => {
  it('lists each RPCS3 user with their name, games and earned trophies', async () => {
    expect(await listUsers(LOCAL_FILES, dataDir)).toEqual([
      { id: USER_ID, name: 'User', games: 1, unlocked: 0 },
    ])
  })

  it('counts earned trophies', async () => {
    earn(5, NOW)

    expect((await listUsers(LOCAL_FILES, dataDir))[0]).toMatchObject({ games: 1, unlocked: 1 })
  })

  it('names a user without a localusername file by their id', async () => {
    rmSync(join(dataDir, 'dev_hdd0', 'home', USER_ID, 'localusername'))

    expect((await listUsers(LOCAL_FILES, dataDir))[0]?.name).toBe(`User ${USER_ID}`)
  })

  it('still lists a user whose progress file is unreadable', async () => {
    writeFileSync(progressFile(), 'garbage')

    expect((await listUsers(LOCAL_FILES, dataDir))[0]).toMatchObject({ games: 1, unlocked: 0 })
  })

  it('has no users when RPCS3 has no home folder yet', async () => {
    rmSync(join(dataDir, 'dev_hdd0', 'home'), { recursive: true })

    expect(await listUsers(LOCAL_FILES, dataDir)).toEqual([])
  })
})

describe('Rpcs3Provider', () => {
  it("connects an install folder's user, named from localusername", async () => {
    const connected = await provider().authenticate({
      kind: 'local_path',
      path: credentials().externalId,
    })

    expect(connected).toEqual(credentials())
    await expect(provider().validate(connected)).resolves.toEqual({
      externalId: credentials().externalId,
      displayName: 'User',
    })
  })

  it('refuses a folder with no RPCS3 data', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'not-rpcs3-'))
    try {
      expect((await thrown(() => provider().validate(credentials(USER_ID, empty)))).kind).toBe(
        'other',
      )
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('refuses other ways of connecting', async () => {
    const error = await thrown(() =>
      provider().authenticate({ kind: 'token', value: new Secret('x') }),
    )

    expect(error.kind).toBe('unsupported')
  })

  it("lists the user's games by trophy set, titled from the trophy list", async () => {
    const played = new Date('2026-10-02T17:21:30.000Z')
    utimesSync(progressFile(), played, played)

    expect(await provider().listGames(credentials())).toEqual([
      {
        ref: { externalId: DEMONS_SOULS },
        title: "Demon's Souls",
        iconUrl: null,
        coverUrl: null,
        lastPlayed: played,
        recentlyPlayed: true,
      },
    ])
  })

  it('uses the trophy folder icon as the cover when it exists', async () => {
    writeFileSync(join(gameDir(), 'ICON0.PNG'), 'png')

    expect((await provider().listGames(credentials()))[0]?.coverUrl).toBe(
      pathToFileURL(join(gameDir(), 'ICON0.PNG')).href,
    )
  })

  it('has no cover when the trophy folder has no icon', async () => {
    expect((await provider().listGames(credentials()))[0]?.coverUrl).toBeNull()
  })

  it('has no cover when the folder cannot be listed for its icon', async () => {
    writeFileSync(join(gameDir(), 'ICON0.PNG'), 'png')
    let listings = 0
    const files: LocalFiles = {
      ...LOCAL_FILES,
      listFolder: (path) => {
        if (path === gameDir() && ++listings > 1) return Promise.reject(new Error('denied'))
        return LOCAL_FILES.listFolder(path)
      },
    }

    expect((await provider(files).listGames(credentials()))[0]?.coverUrl).toBeNull()
  })

  it('counts a game as recently played for two weeks after its progress last changed', async () => {
    const played = new Date(NOW.getTime() - 15 * 24 * 60 * 60_000)
    utimesSync(progressFile(), played, played)

    expect((await provider().listGames(credentials()))[0]?.recentlyPlayed).toBe(false)
  })

  it('titles a game by its trophy set id when the trophy list is unreadable', async () => {
    writeFileSync(join(gameDir(), 'TROPCONF.SFM'), 'not xml')

    expect((await provider().listGames(credentials()))[0]?.title).toBe(DEMONS_SOULS)
  })

  it('skips a trophy folder that has no progress file yet', async () => {
    rmSync(progressFile())

    expect(await provider().listGames(credentials())).toEqual([])
  })

  it('reads the trophy list and the earned trophies for a game', async () => {
    earn(5, new Date('2026-10-02T17:30:00.000Z'))

    const game = await provider().fetchGame(credentials(), { externalId: DEMONS_SOULS })

    expect(game.achievements).toHaveLength(38)
    expect(game.achievements[0]).toMatchObject({ name: 'Toughest Soul Trophy', tier: 'platinum' })
    expect(game.unlocks).toEqual([
      {
        achievementExternalId: '005',
        unlockedAt: new Date('2026-10-02T17:30:00.000Z'),
        progress: null,
      },
    ])
  })

  it('ignores progress for a trophy the list does not name', async () => {
    earn(5, NOW)
    writeFileSync(
      join(gameDir(), 'TROPCONF.SFM'),
      `<trophyconf><npcommid>${DEMONS_SOULS}</npcommid><trophy id="000" hidden="no" ttype="P"/></trophyconf>`,
    )

    const game = await provider().fetchGame(credentials(), { externalId: DEMONS_SOULS })

    expect(game.unlocks).toEqual([])
  })

  it('has no games for a user with no trophy folder', async () => {
    expect(await provider().listGames(credentials('00000002'))).toEqual([])
  })

  it('reports a parse error when a game has no trophy list', async () => {
    rmSync(join(gameDir(), 'TROPCONF.SFM'))

    const error = await thrown(() =>
      provider().fetchGame(credentials(), { externalId: DEMONS_SOULS }),
    )

    expect(error.kind).toBe('parse')
  })

  it('refuses a trophy list that belongs to another game', async () => {
    cpSync(gameDir(), join(gameDir(), '..', 'NPWR00001_00'), { recursive: true })

    const error = await thrown(() =>
      provider().fetchGame(credentials(), { externalId: 'NPWR00001_00' }),
    )

    expect(error.kind).toBe('parse')
  })

  it('reads the progress file again when RPCS3 was half-way through writing it', async () => {
    earn(5, NOW)
    const full = fixtureBytes()
    let reads = 0
    const delay = vi.fn(() => Promise.resolve())
    const files: LocalFiles = {
      ...LOCAL_FILES,
      readBytes: (path, maxBytes) => {
        if (path !== progressFile()) return LOCAL_FILES.readBytes(path, maxBytes)
        reads += 1
        return Promise.resolve(reads === 1 ? full.subarray(0, 200) : withUnlock(full, 5, NOW))
      },
    }

    const game = await new Rpcs3Provider(files, { delay }).fetchGame(credentials(), {
      externalId: DEMONS_SOULS,
    })

    expect(game.unlocks).toHaveLength(1)
    expect(delay).toHaveBeenCalledWith(RETRY_READ_MS)
  })
})

describe('watchUserTrophies', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function fakeWatcher() {
    let listener: (name: string) => void = () => undefined
    const stopFolder = vi.fn()
    const watchFolder = vi.fn<LocalFiles['watchFolder']>((_path, onFile) => {
      listener = onFile
      return stopFolder
    })
    return { watchFolder, stopFolder, emit: (name: string) => listener(name) }
  }

  it('reports a changed game once after a burst of writes, ignoring other files', () => {
    vi.useFakeTimers()
    const { watchFolder, emit } = fakeWatcher()
    const onGame = vi.fn<(npCommId: string) => void>()

    const stop = watchUserTrophies({ ...LOCAL_FILES, watchFolder }, credentialsAccount(), onGame)
    emit(`${DEMONS_SOULS}\\TROPUSR.DAT`)
    emit(`${DEMONS_SOULS}/TROPUSR.DAT`)
    emit(`${DEMONS_SOULS}\\TROP000.PNG`)
    emit('TROPUSR.DAT')
    emit(`${DEMONS_SOULS}\\TROPUSR.DAT`)
    vi.advanceTimersByTime(DEBOUNCE_MS)

    expect(watchFolder).toHaveBeenCalledWith(
      join(dataDir, 'dev_hdd0', 'home', USER_ID, 'trophy'),
      expect.any(Function),
      { recursive: true },
    )
    expect(onGame.mock.calls).toEqual([[DEMONS_SOULS]])
    stop()
  })

  it('stops watching and drops a pending report once stopped', () => {
    vi.useFakeTimers()
    const { watchFolder, stopFolder, emit } = fakeWatcher()
    const onGame = vi.fn<(npCommId: string) => void>()

    const stop = watchUserTrophies({ ...LOCAL_FILES, watchFolder }, credentialsAccount(), onGame)
    emit(`${DEMONS_SOULS}\\TROPUSR.DAT`)
    stop()
    vi.advanceTimersByTime(DEBOUNCE_MS)

    expect(stopFolder).toHaveBeenCalledOnce()
    expect(onGame).not.toHaveBeenCalled()
  })

  it('sees RPCS3 rewrite a progress file in a real folder', async () => {
    const onGame = vi.fn<(npCommId: string) => void>()
    const stop = watchUserTrophies(LOCAL_FILES, credentialsAccount(), onGame)

    await new Promise((resolve) => setTimeout(resolve, 100))
    earn(5, NOW)

    await vi.waitFor(() => expect(onGame).toHaveBeenCalledWith(DEMONS_SOULS), { timeout: 3000 })
    stop()
  })
})

describe('RPCS3 through the sync engine', () => {
  it('saves existing trophies silently, then announces exactly one new unlock', async () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const account = upsertAccount(db, {
      platform: 'rpcs3',
      externalId: credentials().externalId,
      displayName: 'User',
    })
    const onUnlocks = vi.fn<(events: UnlockEvent[]) => void>()
    let now = NOW
    const scheduler = new Scheduler({
      db,
      providers: { rpcs3: provider() },
      secrets: new InMemorySecretStore(),
      onUnlocks,
      now: () => now,
      random: () => 0,
    })

    await scheduler.syncLibrary(account.id, true)
    await scheduler.syncDueGames(account.id, true)
    expect(onUnlocks).not.toHaveBeenCalled()

    now = new Date(NOW.getTime() + 60_000)
    earn(6, now)
    await scheduler.syncDueGames(account.id, true)

    expect(onUnlocks).toHaveBeenCalledOnce()
    const events = onUnlocks.mock.calls[0]?.[0] ?? []
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'rpcs3',
      gameTitle: "Demon's Souls",
      unlockedAt: now,
      achievement: { externalId: '006', name: "False King's Trophy", tier: 'silver' },
    })
  })
})
