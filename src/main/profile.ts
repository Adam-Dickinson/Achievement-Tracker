import { userInfo } from 'node:os'
import type { DatabaseSync } from 'node:sqlite'
import type { Profile } from '@shared/ipc'
import { readProfileName } from './store/settings-store'

export function windowsUserName(read: () => string = () => userInfo().username): string {
  try {
    return read().trim()
  } catch {
    return ''
  }
}

export function getProfile(db: DatabaseSync, windowsName: string): Profile {
  return { name: readProfileName(db), windowsName }
}
