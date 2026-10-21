import { win32 } from 'node:path'
import type { PlayResult } from '@shared/launch'
import type { LaunchTarget } from './types'

const LAUNCH_SCHEMES: readonly string[] = [
  'steam:',
  'uplay:',
  'com.epicgames.launcher:',
  'origin2:',
]

const APP_USER_MODEL_ID = /^[A-Za-z0-9.-]{3,50}_[0-9a-hjkmnp-tv-z]{13}![A-Za-z][A-Za-z0-9.]{0,63}$/

export interface StartDeps {
  openExternal(uri: string): Promise<void>
  spawnProgram(exe: string, args: readonly string[]): Promise<void>
  openPackage(appUserModelId: string): Promise<void>
  fileExists(path: string): Promise<boolean>
}

export function isLaunchUri(uri: string): boolean {
  if (/\s/.test(uri)) return false
  try {
    return LAUNCH_SCHEMES.includes(new URL(uri).protocol)
  } catch {
    return false
  }
}

export function isAppUserModelId(id: string): boolean {
  return APP_USER_MODEL_ID.test(id)
}

export async function startTarget(target: LaunchTarget, deps: StartDeps): Promise<PlayResult> {
  switch (target.kind) {
    case 'uri':
      return startUri(target.uri, deps)
    case 'program':
      return startProgram(target.exe, target.args, deps)
    case 'package':
      return startPackage(target.appUserModelId, deps)
  }
}

async function startUri(uri: string, deps: StartDeps): Promise<PlayResult> {
  if (!isLaunchUri(uri)) return { ok: false, reason: 'That game cannot be started from here.' }
  try {
    await deps.openExternal(uri)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'Could not open the launcher.' }
  }
}

async function startProgram(
  exe: string,
  args: readonly string[],
  deps: StartDeps,
): Promise<PlayResult> {
  if (!win32.isAbsolute(exe) || !exe.toLowerCase().endsWith('.exe')) {
    return { ok: false, reason: 'That game cannot be started from here.' }
  }
  if (!(await deps.fileExists(exe))) return { ok: false, reason: 'The program was not found.' }
  try {
    await deps.spawnProgram(exe, args)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'The program could not be started.' }
  }
}

async function startPackage(appUserModelId: string, deps: StartDeps): Promise<PlayResult> {
  if (!isAppUserModelId(appUserModelId)) {
    return { ok: false, reason: 'That game cannot be started from here.' }
  }
  try {
    await deps.openPackage(appUserModelId)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'The game could not be started.' }
  }
}
