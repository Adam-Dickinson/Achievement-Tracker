import {
  cpSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
import { ShadPs4Provider } from '.'
import {
  accountExternalId,
  DEBOUNCE_MS,
  defaultDataDirs,
  listUsers,
  parseAccountExternalId,
  RETRY_READ_MS,
  watchUserTrophies,
} from './local'

const BLOODBORNE = 'NPWR05818_00'
const NOW = new Date('2026-07-10T12:00:00.000Z')

let dataDir: string

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'shadps4-'))
  cpSync(resolve('tests/fixtures/shadps4/data'), dataDir, { recursive: true })
  pointHomeTo(join(dataDir, 'home'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

function pointHomeTo(home: string | null): void {
  const path = join(dataDir, 'config.json')
  const config = JSON.parse(readFileSync(path, 'utf8')) as { General: Record<string, unknown> }
  if (home === null) delete config.General.home_dir
  else config.General.home_dir = home
  writeFileSync(path, JSON.stringify(config))
}

function credentials(userId = '1000', dir = dataDir): AccountCredentials {
  return {
    platform: 'shadps4',
    externalId: accountExternalId({ dataDir: dir, userId }),
    secret: null,
  }
}

function provider(files: LocalFiles = LOCAL_FILES): ShadPs4Provider {
  return new ShadPs4Provider(files, { now: () => NOW, delay: () => Promise.resolve() })
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

function userFile(userId = '1000'): string {
  return join(dataDir, 'home', userId, 'trophy', `${BLOODBORNE}.xml`)
}

function unlockInUserFile(trophyId: string, seconds: number): void {
  const path = userFile()
  const xml = readFileSync(path, 'utf8').replace(
    new RegExp(`(<trophy id="${trophyId}"[^>]*?)\\s*/>`),
    `$1 unlockstate="true" timestamp="${seconds}" />`,
  )
  writeFileSync(path, xml)
}

describe('shadPS4 account ids', () => {
  it('round-trips a data folder and user', () => {
    const account = { dataDir: 'C:\\Users\\player\\AppData\\Roaming\\shadPS4', userId: '1000' }

    expect(parseAccountExternalId(accountExternalId(account))).toEqual(account)
  })

  it.each(['C:\\shadPS4', 'C:\\shadPS4|', '|1000', 'C:\\shadPS4|me'])(
    'rejects %s',
    (externalId) => {
      expect(() => parseAccountExternalId(externalId)).toThrow(ProviderError)
    },
  )

  it("looks for shadPS4 in the user's roaming app data", () => {
    expect(defaultDataDirs({ APPDATA: 'C:\\Users\\player\\AppData\\Roaming' })).toEqual([
      join('C:\\Users\\player\\AppData\\Roaming', 'shadPS4'),
    ])
    expect(defaultDataDirs({})).toEqual([])
  })
})

describe('listUsers', () => {
  it('lists each shadPS4 user with how many games and trophies they have', async () => {
    const users = await listUsers(LOCAL_FILES, dataDir)

    expect(users).toEqual([
      { id: '1000', name: 'Player 1', games: 1, unlocked: 10 },
      { id: '1001', name: 'Player 2', games: 1, unlocked: 0 },
      { id: '1002', name: 'Player 3', games: 0, unlocked: 0 },
      { id: '1003', name: 'Player 4', games: 0, unlocked: 0 },
    ])
  })

  it('finds users from their home folders when users.json is missing', async () => {
    rmSync(join(dataDir, 'users.json'))

    expect((await listUsers(LOCAL_FILES, dataDir)).map((user) => user.name)).toEqual([
      'User 1000',
      'User 1001',
    ])
  })
})

describe('ShadPs4Provider', () => {
  it("connects a data folder's user, named from users.json", async () => {
    const connected = await provider().authenticate({
      kind: 'local_path',
      path: credentials().externalId,
    })

    expect(connected).toEqual(credentials())
    await expect(provider().validate(connected)).resolves.toEqual({
      externalId: credentials().externalId,
      displayName: 'Player 1',
    })
  })

  it('refuses a folder with no shadPS4 data', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'not-shadps4-'))
    try {
      expect((await thrown(() => provider().validate(credentials('1000', empty)))).kind).toBe(
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
    const played = new Date('2026-07-08T20:45:51.000Z')
    utimesSync(userFile(), played, played)

    const games = await provider().listGames(credentials())

    expect(games).toEqual([
      {
        ref: { externalId: BLOODBORNE },
        title: 'Bloodborne',
        iconUrl: null,
        coverUrl: null,
        lastPlayed: played,
        recentlyPlayed: true,
      },
    ])
  })

  it('counts a game as recently played for two weeks after its progress last changed', async () => {
    const played = new Date(NOW.getTime() - 15 * 24 * 60 * 60_000)
    utimesSync(userFile(), played, played)

    const [game] = await provider().listGames(credentials())

    expect(game?.recentlyPlayed).toBe(false)
  })

  it('reads the trophy list and the user’s unlocks for a game', async () => {
    const game = await provider().fetchGame(credentials(), { externalId: BLOODBORNE })

    expect(game.achievements).toHaveLength(40)
    expect(game.unlocks).toHaveLength(10)
    expect(game.achievements[0]).toMatchObject({ name: 'Bloodborne', tier: 'platinum' })
  })

  it('keeps each user’s progress separate', async () => {
    const game = await provider().fetchGame(credentials('1001'), { externalId: BLOODBORNE })

    expect(game.unlocks).toEqual([])
  })

  it('follows a home folder moved in config.json', async () => {
    const moved = join(dataDir, 'elsewhere')
    renameSync(join(dataDir, 'home'), moved)
    pointHomeTo(moved)

    expect(await provider().listGames(credentials())).toHaveLength(1)
  })

  it('uses the home folder in the data folder when config.json names none', async () => {
    pointHomeTo(null)

    expect(await provider().listGames(credentials())).toHaveLength(1)
  })

  it('has no games for a user with no trophy folder', async () => {
    expect(await provider().listGames(credentials('1003'))).toEqual([])
  })

  it('reports a parse error when a game has no trophy list', async () => {
    rmSync(join(dataDir, 'trophy', BLOODBORNE), { recursive: true })

    const error = await thrown(() =>
      provider().fetchGame(credentials(), { externalId: BLOODBORNE }),
    )

    expect(error.kind).toBe('parse')
  })

  it('reads the progress file again when shadPS4 was half-way through writing it', async () => {
    const full = readFileSync(userFile(), 'utf8')
    let reads = 0
    const delay = vi.fn(() => Promise.resolve())
    const files: LocalFiles = {
      ...LOCAL_FILES,
      readText: (path, maxBytes) => {
        if (path !== userFile()) return LOCAL_FILES.readText(path, maxBytes)
        reads += 1
        return Promise.resolve(reads === 1 ? full.slice(0, 200) : full)
      },
    }

    const game = await new ShadPs4Provider(files, { delay }).fetchGame(credentials(), {
      externalId: BLOODBORNE,
    })

    expect(game.unlocks).toHaveLength(10)
    expect(delay).toHaveBeenCalledWith(RETRY_READ_MS)
  })
})

describe('watchUserTrophies', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports a changed game once after a burst of writes, ignoring other files', async () => {
    vi.useFakeTimers()
    let listener: (name: string) => void = () => undefined
    const watchFolder = vi.fn<LocalFiles['watchFolder']>((_path, onFile) => {
      listener = onFile
      return () => undefined
    })
    const onGame = vi.fn<(npCommId: string) => void>()

    const stop = watchUserTrophies({ ...LOCAL_FILES, watchFolder }, credentialsAccount(), onGame)
    await vi.waitFor(() => expect(watchFolder).toHaveBeenCalled())
    listener(`${BLOODBORNE}.xml`)
    listener(`${BLOODBORNE}.xml`)
    listener('notes.txt')
    listener(`${BLOODBORNE}.xml`)
    vi.advanceTimersByTime(DEBOUNCE_MS)

    expect(watchFolder).toHaveBeenCalledWith(join(dataDir, 'home', '1000', 'trophy'), listener)
    expect(onGame.mock.calls).toEqual([[BLOODBORNE]])
    stop()
  })

  it('drops a pending report once stopped', async () => {
    vi.useFakeTimers()
    let listener: (name: string) => void = () => undefined
    const watchFolder = vi.fn<LocalFiles['watchFolder']>((_path, onFile) => {
      listener = onFile
      return () => undefined
    })
    const onGame = vi.fn<(npCommId: string) => void>()

    const stop = watchUserTrophies({ ...LOCAL_FILES, watchFolder }, credentialsAccount(), onGame)
    await vi.waitFor(() => expect(watchFolder).toHaveBeenCalled())
    listener(`${BLOODBORNE}.xml`)
    stop()
    vi.advanceTimersByTime(DEBOUNCE_MS)

    expect(onGame).not.toHaveBeenCalled()
  })
})

function credentialsAccount() {
  return parseAccountExternalId(credentials().externalId)
}

describe('shadPS4 through the sync engine', () => {
  it('saves existing trophies silently, then announces exactly one new unlock', async () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const account = upsertAccount(db, {
      platform: 'shadps4',
      externalId: credentials().externalId,
      displayName: 'Player 1',
    })
    const onUnlocks = vi.fn<(events: UnlockEvent[]) => void>()
    let now = NOW
    const scheduler = new Scheduler({
      db,
      providers: { shadps4: provider() },
      secrets: new InMemorySecretStore(),
      onUnlocks,
      now: () => now,
      random: () => 0,
    })

    await scheduler.syncLibrary(account.id, true)
    await scheduler.syncDueGames(account.id, true)
    expect(onUnlocks).not.toHaveBeenCalled()

    now = new Date(NOW.getTime() + 60_000)
    unlockInUserFile('005', now.getTime() / 1000)
    await scheduler.syncDueGames(account.id, true)

    expect(onUnlocks).toHaveBeenCalledOnce()
    const events = onUnlocks.mock.calls[0]?.[0] ?? []
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'shadps4',
      gameTitle: 'Bloodborne',
      unlockedAt: now,
      achievement: { externalId: '005', tier: 'gold' },
    })
  })
})
