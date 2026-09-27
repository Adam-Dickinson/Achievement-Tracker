import { userInfo } from 'node:os'
import type { AppInfo } from '@shared/ipc'

export function appInfo(
  version: string,
  schemaVersion: number,
  readUserName: () => string = () => userInfo().username,
): AppInfo {
  return { version, schemaVersion, userName: safeUserName(readUserName) }
}

function safeUserName(read: () => string): string {
  try {
    return read().trim()
  } catch {
    return ''
  }
}
