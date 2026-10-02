import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemorySecretStore } from '@shared/secret-store'
import { LOCAL_FILES } from './providers/local-files'
import { Rpcs3Provider } from './providers/rpcs3'
import { FIXTURE_DATA_DIR } from './providers/rpcs3/test-helpers'
import { Rpcs3Accounts, type Rpcs3AccountsDeps } from './rpcs3-accounts'
import { applyMigrations } from './store/migrate'

let root: string
let db: DatabaseSync
const startAccount = vi.fn<(accountId: number) => void>()

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rpcs3-accounts-'))
  db = new DatabaseSync(':memory:')
  applyMigrations(db)
  startAccount.mockReset()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function installAt(dir: string): string {
  cpSync(FIXTURE_DATA_DIR, dir, { recursive: true })
  return dir
}

function accounts(overrides: Partial<Rpcs3AccountsDeps> = {}): Rpcs3Accounts {
  return new Rpcs3Accounts({
    db,
    rpcs3: new Rpcs3Provider(),
    secrets: new InMemorySecretStore(),
    scheduler: { startAccount },
    files: LOCAL_FILES,
    chooseFolder: () => Promise.resolve(null),
    defaultDirs: () => [join(root, 'rpcs3')],
    ...overrides,
  })
}

describe('Rpcs3Accounts.find', () => {
  it("finds RPCS3 in a default folder, with each user's progress", async () => {
    const dataDir = installAt(join(root, 'rpcs3'))

    const found = await accounts().find()

    expect(found?.path).toBe(dataDir)
    expect(found?.users).toEqual([{ id: '00000001', name: 'User', games: 1, unlocked: 0 }])
  })

  it('finds nothing when RPCS3 has never run there', async () => {
    await expect(accounts().find()).resolves.toBeNull()
  })

  it('finds nothing when there is no default folder to look in', async () => {
    await expect(accounts({ defaultDirs: () => [] }).find()).resolves.toBeNull()
  })
})

describe('Rpcs3Accounts.choose', () => {
  it('accepts a chosen install folder', async () => {
    const dataDir = installAt(join(root, 'anywhere'))

    const result = await accounts({ chooseFolder: () => Promise.resolve(dataDir) }).choose()

    expect(result).toMatchObject({ kind: 'chosen', folder: { path: dataDir } })
  })

  it('accepts the dev_hdd0 folder inside an install', async () => {
    const dataDir = installAt(join(root, 'anywhere'))

    const result = await accounts({
      chooseFolder: () => Promise.resolve(join(dataDir, 'dev_hdd0')),
    }).choose()

    expect(result).toMatchObject({ kind: 'chosen', folder: { path: dataDir } })
  })

  it('says so when the chosen folder has no RPCS3 data', async () => {
    const empty = join(root, 'empty')
    mkdirSync(empty)

    const result = await accounts({ chooseFolder: () => Promise.resolve(empty) }).choose()

    expect(result).toEqual({ kind: 'not_found', path: empty })
  })

  it('does nothing when the chooser is cancelled', async () => {
    await expect(accounts().choose()).resolves.toEqual({ kind: 'cancelled' })
  })
})

describe('Rpcs3Accounts.connect', () => {
  it('connects a user of a folder it found and starts syncing it', async () => {
    const dataDir = installAt(join(root, 'rpcs3'))
    const rpcs3 = accounts()
    await rpcs3.find()

    const result = await rpcs3.connect({ path: dataDir, userId: '00000001' })

    expect(result).toMatchObject({
      ok: true,
      account: { platform: 'rpcs3', displayName: 'User', status: 'connected' },
    })
    expect(startAccount).toHaveBeenCalledOnce()
  })

  it('refuses a folder it was never shown, so the page cannot point it anywhere', async () => {
    const dataDir = installAt(join(root, 'rpcs3'))

    const result = await accounts().connect({ path: dataDir, userId: '00000001' })

    expect(result).toMatchObject({ ok: false, reason: 'invalid_input' })
    expect(startAccount).not.toHaveBeenCalled()
  })

  it('refuses a user id that is not an RPCS3 user', async () => {
    const dataDir = installAt(join(root, 'rpcs3'))
    const rpcs3 = accounts()
    await rpcs3.find()

    const result = await rpcs3.connect({ path: dataDir, userId: '../x' })

    expect(result).toMatchObject({ ok: false, reason: 'other' })
    expect(startAccount).not.toHaveBeenCalled()
  })

  it('reports a folder that has since lost its RPCS3 data', async () => {
    const dataDir = installAt(join(root, 'rpcs3'))
    const rpcs3 = accounts()
    await rpcs3.find()
    rmSync(dataDir, { recursive: true })

    const result = await rpcs3.connect({ path: dataDir, userId: '00000001' })

    expect(result).toMatchObject({ ok: false, reason: 'other' })
    expect(startAccount).not.toHaveBeenCalled()
  })
})
