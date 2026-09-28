import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemorySecretStore } from '@shared/secret-store'
import { LOCAL_FILES } from './providers/local-files'
import { ShadPs4Provider } from './providers/shadps4'
import { ShadPs4Accounts, type ShadPs4AccountsDeps } from './shadps4-accounts'
import { applyMigrations } from './store/migrate'

let root: string
let db: DatabaseSync
const startAccount = vi.fn<(accountId: number) => void>()

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'shadps4-accounts-'))
  db = new DatabaseSync(':memory:')
  applyMigrations(db)
  startAccount.mockReset()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function copyDataTo(dir: string): string {
  cpSync(resolve('tests/fixtures/shadps4/data'), dir, { recursive: true })
  rmSync(join(dir, 'config.json'))
  return dir
}

function accounts(overrides: Partial<ShadPs4AccountsDeps> = {}): ShadPs4Accounts {
  return new ShadPs4Accounts({
    db,
    shadps4: new ShadPs4Provider(),
    secrets: new InMemorySecretStore(),
    scheduler: { startAccount },
    files: LOCAL_FILES,
    chooseFolder: () => Promise.resolve(null),
    env: { APPDATA: root },
    ...overrides,
  })
}

describe('ShadPs4Accounts.find', () => {
  it("finds shadPS4 in roaming app data, with each user's progress", async () => {
    const dataDir = copyDataTo(join(root, 'shadPS4'))

    const found = await accounts().find()

    expect(found?.path).toBe(dataDir)
    expect(found?.users[0]).toEqual({ id: '1000', name: 'Player 1', games: 1, unlocked: 10 })
  })

  it('finds nothing when shadPS4 has never run', async () => {
    await expect(accounts().find()).resolves.toBeNull()
  })
})

describe('ShadPs4Accounts.choose', () => {
  it('accepts a chosen data folder', async () => {
    const dataDir = copyDataTo(join(root, 'anywhere'))

    const result = await accounts({ chooseFolder: () => Promise.resolve(dataDir) }).choose()

    expect(result).toMatchObject({ kind: 'chosen', folder: { path: dataDir } })
  })

  it("finds the data in a portable install's user folder", async () => {
    const install = join(root, 'ShadPS4')
    copyDataTo(join(install, 'user'))

    const result = await accounts({ chooseFolder: () => Promise.resolve(install) }).choose()

    expect(result).toMatchObject({ kind: 'chosen', folder: { path: join(install, 'user') } })
  })

  it('says so when the chosen folder has no shadPS4 data', async () => {
    const empty = join(root, 'empty')
    mkdirSync(empty)

    const result = await accounts({ chooseFolder: () => Promise.resolve(empty) }).choose()

    expect(result).toEqual({ kind: 'not_found', path: empty })
  })

  it('does nothing when the chooser is cancelled', async () => {
    await expect(accounts().choose()).resolves.toEqual({ kind: 'cancelled' })
  })
})

describe('ShadPs4Accounts.connect', () => {
  it('connects a user of a folder it found and starts syncing it', async () => {
    const dataDir = copyDataTo(join(root, 'shadPS4'))
    const shadps4 = accounts()
    await shadps4.find()

    const result = await shadps4.connect({ path: dataDir, userId: '1000' })

    expect(result).toMatchObject({
      ok: true,
      account: { platform: 'shadps4', displayName: 'Player 1', status: 'connected' },
    })
    expect(startAccount).toHaveBeenCalledOnce()
  })

  it('refuses a folder it was never shown, so the page cannot point it anywhere', async () => {
    const dataDir = copyDataTo(join(root, 'shadPS4'))

    const result = await accounts().connect({ path: dataDir, userId: '1000' })

    expect(result).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(startAccount).not.toHaveBeenCalled()
  })

  it('reports a folder that has since lost its shadPS4 data', async () => {
    const dataDir = copyDataTo(join(root, 'shadPS4'))
    const shadps4 = accounts()
    await shadps4.find()
    rmSync(dataDir, { recursive: true })

    const result = await shadps4.connect({ path: dataDir, userId: '1000' })

    expect(result).toMatchObject({ ok: false, reason: 'other' })
    expect(startAccount).not.toHaveBeenCalled()
  })
})
