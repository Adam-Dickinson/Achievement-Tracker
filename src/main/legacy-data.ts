import { existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const DATABASE_FILE = 'trophy-locker.db'

const LEGACY_FOLDER = 'achievement-tracker'
const LEGACY_DATABASE_FILE = 'achievement-tracker.db'
const SQLITE_SUFFIXES = ['', '-wal', '-shm'] as const

export function moveLegacyData(appDataDir: string, userDataDir: string): boolean {
  const legacyDir = join(appDataDir, LEGACY_FOLDER)
  if (!existsSync(join(legacyDir, LEGACY_DATABASE_FILE))) return false
  if (existsSync(join(userDataDir, DATABASE_FILE))) return false

  rmSync(userDataDir, { recursive: true, force: true })
  renameSync(legacyDir, userDataDir)
  for (const suffix of SQLITE_SUFFIXES) {
    const from = join(userDataDir, LEGACY_DATABASE_FILE + suffix)
    if (existsSync(from)) renameSync(from, join(userDataDir, DATABASE_FILE + suffix))
  }
  return true
}
