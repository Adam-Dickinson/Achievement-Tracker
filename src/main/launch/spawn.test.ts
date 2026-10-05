import { describe, expect, it } from 'vitest'
import { spawnDetached } from './spawn'

describe('spawnDetached', () => {
  it('resolves once the program has started', async () => {
    await expect(spawnDetached(process.execPath, ['-e', ''])).resolves.toBeUndefined()
  })

  it('rejects when the program cannot be started', async () => {
    await expect(spawnDetached('Z:\\definitely\\missing.exe', [])).rejects.toBeInstanceOf(Error)
  })
})
