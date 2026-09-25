import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_FILE, moveLegacyData } from './legacy-data'

let appData: string
let legacyDir: string
let userData: string

beforeEach(() => {
  appData = mkdtempSync(join(tmpdir(), 'legacy-data-'))
  legacyDir = join(appData, 'achievement-tracker')
  userData = join(appData, 'trophy-locker')
})

afterEach(() => {
  rmSync(appData, { recursive: true, force: true })
})

function writeLegacy(files: Record<string, string>): void {
  mkdirSync(legacyDir, { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(legacyDir, name), content)
}

function read(name: string): string {
  return readFileSync(join(userData, name), 'utf8')
}

describe('moveLegacyData', () => {
  it('moves the old data folder and renames the database with its WAL files', () => {
    writeLegacy({
      'achievement-tracker.db': 'db',
      'achievement-tracker.db-wal': 'wal',
      'achievement-tracker.db-shm': 'shm',
      'secrets.json': 'secrets',
      'Local State': 'key',
    })

    expect(moveLegacyData(appData, userData)).toBe(true)

    expect(read(DATABASE_FILE)).toBe('db')
    expect(read('trophy-locker.db-wal')).toBe('wal')
    expect(read('trophy-locker.db-shm')).toBe('shm')
    expect(read('secrets.json')).toBe('secrets')
    expect(read('Local State')).toBe('key')
    expect(existsSync(join(userData, 'achievement-tracker.db'))).toBe(false)
    expect(existsSync(legacyDir)).toBe(false)
  })

  it('replaces a new data folder that has no database yet', () => {
    writeLegacy({ 'achievement-tracker.db': 'db' })
    mkdirSync(userData)
    writeFileSync(join(userData, 'Local State'), 'fresh key')

    expect(moveLegacyData(appData, userData)).toBe(true)

    expect(read(DATABASE_FILE)).toBe('db')
    expect(existsSync(join(userData, 'Local State'))).toBe(false)
  })

  it('moves a database that has no WAL files', () => {
    writeLegacy({ 'achievement-tracker.db': 'db' })

    expect(moveLegacyData(appData, userData)).toBe(true)

    expect(read(DATABASE_FILE)).toBe('db')
    expect(existsSync(join(userData, 'trophy-locker.db-wal'))).toBe(false)
  })

  it('does nothing when there is no old database', () => {
    mkdirSync(legacyDir)

    expect(moveLegacyData(appData, userData)).toBe(false)

    expect(existsSync(legacyDir)).toBe(true)
    expect(existsSync(userData)).toBe(false)
  })

  it('leaves both folders alone once the new database exists', () => {
    writeLegacy({ 'achievement-tracker.db': 'old' })
    mkdirSync(userData)
    writeFileSync(join(userData, DATABASE_FILE), 'new')

    expect(moveLegacyData(appData, userData)).toBe(false)

    expect(read(DATABASE_FILE)).toBe('new')
    expect(existsSync(join(legacyDir, 'achievement-tracker.db'))).toBe(true)
  })
})
