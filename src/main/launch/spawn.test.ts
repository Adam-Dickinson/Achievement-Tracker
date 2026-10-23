import { describe, expect, it } from 'vitest'
import { appsFolderCommand, spawnDetached } from './spawn'

describe('spawnDetached', () => {
  it('resolves once the program has started', async () => {
    await expect(spawnDetached(process.execPath, ['-e', ''])).resolves.toBeUndefined()
  })

  it('rejects when the program cannot be started', async () => {
    await expect(spawnDetached('Z:\\definitely\\missing.exe', [])).rejects.toBeInstanceOf(Error)
  })
})

describe('appsFolderCommand', () => {
  it('opens the app through Explorer in the Windows folder', () => {
    expect(appsFolderCommand('Studio.Game_5bkah9njm3e9g!Game', 'D:\\WINDOWS')).toEqual({
      exe: 'D:\\WINDOWS\\explorer.exe',
      args: ['shell:AppsFolder\\Studio.Game_5bkah9njm3e9g!Game'],
    })
  })

  it('falls back to C:\\Windows when the Windows folder is not set', () => {
    expect(appsFolderCommand('Studio.Game_5bkah9njm3e9g!Game', undefined).exe).toBe(
      'C:\\Windows\\explorer.exe',
    )
  })
})
