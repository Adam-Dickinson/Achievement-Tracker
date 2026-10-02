import { describe, expect, it, vi } from 'vitest'
import { openLogsFolder } from './logs-folder'

describe('openLogsFolder', () => {
  it('creates the folder, then opens it', async () => {
    const calls: string[] = []
    const makeFolder = vi.fn((dir: string) => {
      calls.push(`make ${dir}`)
      return Promise.resolve()
    })
    const openPath = vi.fn((dir: string) => {
      calls.push(`open ${dir}`)
      return Promise.resolve('')
    })

    await openLogsFolder('logs-dir', { makeFolder, openPath })

    expect(calls).toEqual(['make logs-dir', 'open logs-dir'])
  })

  it('throws the message when the folder cannot be opened', async () => {
    const openPath = vi.fn(() => Promise.resolve('No application is associated'))

    await expect(
      openLogsFolder('logs-dir', { makeFolder: () => Promise.resolve(), openPath }),
    ).rejects.toThrow('No application is associated')
  })

  it('throws when the folder cannot be created', async () => {
    const openPath = vi.fn(() => Promise.resolve(''))

    await expect(
      openLogsFolder('logs-dir', {
        makeFolder: () => Promise.reject(new Error('denied')),
        openPath,
      }),
    ).rejects.toThrow('denied')
    expect(openPath).not.toHaveBeenCalled()
  })
})
