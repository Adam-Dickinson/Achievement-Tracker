import { spawn } from 'node:child_process'
import { win32 } from 'node:path'

export function spawnDetached(exe: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, [...args], { detached: true, stdio: 'ignore', shell: false })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export function appsFolderCommand(
  appUserModelId: string,
  systemRoot: string | undefined,
): { readonly exe: string; readonly args: readonly string[] } {
  return {
    exe: win32.join(systemRoot ?? 'C:\\Windows', 'explorer.exe'),
    args: [`shell:AppsFolder\\${appUserModelId}`],
  }
}

export function openAppPackage(appUserModelId: string): Promise<void> {
  const { exe, args } = appsFolderCommand(appUserModelId, process.env['SystemRoot'])
  return spawnDetached(exe, args)
}
