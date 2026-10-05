import { win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { EmulatorPrograms } from './emulator-programs'

const DIR = 'D:\\Emu\\rpcs3'
const BESIDE = win32.join(DIR, 'rpcs3.exe')
const CHOSEN = 'E:\\Tools\\rpcs3\\rpcs3.exe'

function service(
  over: Partial<ConstructorParameters<typeof EmulatorPrograms>[0]> = {},
  existing: string[] = [BESIDE],
) {
  const saved = new Map<string, string>()
  const onChanged = vi.fn()
  const svc = new EmulatorPrograms({
    read: () => saved.get('rpcs3') ?? null,
    save: (emulator, path) => void saved.set(emulator, path),
    dataDirs: () => [DIR],
    fileExists: (path) => Promise.resolve(existing.includes(path)),
    chooseFile: () => Promise.resolve(CHOSEN),
    onChanged,
    ...over,
  })
  return { svc, saved, onChanged }
}

describe('EmulatorPrograms', () => {
  it('finds rpcs3.exe beside the data folder', async () => {
    await expect(service().svc.list()).resolves.toEqual([
      { emulator: 'rpcs3', path: BESIDE, source: 'found' },
    ])
  })

  it('reports nothing when it is not beside the data folder and none is chosen', async () => {
    await expect(service({}, []).svc.list()).resolves.toEqual([
      { emulator: 'rpcs3', path: null, source: null },
    ])
  })

  it('prefers a saved program that still exists', async () => {
    const { svc } = service({ read: () => CHOSEN }, [BESIDE, CHOSEN])

    await expect(svc.list()).resolves.toEqual([
      { emulator: 'rpcs3', path: CHOSEN, source: 'chosen' },
    ])
    await expect(svc.resolve('rpcs3', DIR)).resolves.toBe(CHOSEN)
  })

  it('falls back to the one beside the data folder when the saved program is gone', async () => {
    const { svc } = service({ read: () => CHOSEN }, [BESIDE])

    await expect(svc.resolve('rpcs3', DIR)).resolves.toBe(BESIDE)
  })

  it('resolves to null when nothing exists', async () => {
    await expect(service({}, []).svc.resolve('rpcs3', DIR)).resolves.toBeNull()
  })

  it('saves a chosen exe, announces the change and returns it', async () => {
    const { svc, saved, onChanged } = service({}, [BESIDE, CHOSEN])

    await expect(svc.choose('rpcs3')).resolves.toEqual({
      emulator: 'rpcs3',
      path: CHOSEN,
      source: 'chosen',
    })
    expect(saved.get('rpcs3')).toBe(CHOSEN)
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('keeps the current program when the dialog is cancelled', async () => {
    const { svc, saved, onChanged } = service({ chooseFile: () => Promise.resolve(null) })

    await expect(svc.choose('rpcs3')).resolves.toEqual({
      emulator: 'rpcs3',
      path: BESIDE,
      source: 'found',
    })
    expect(saved.size).toBe(0)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it.each(['relative.exe', 'E:\\Tools\\notes.txt', 'E:\\Tools\\rpcs3.bat'])(
    'refuses to save %s',
    async (path) => {
      const { svc, saved } = service({ chooseFile: () => Promise.resolve(path) }, [BESIDE, path])

      await svc.choose('rpcs3')

      expect(saved.size).toBe(0)
    },
  )

  it('refuses to save an exe that does not exist', async () => {
    const { svc, saved } = service({}, [BESIDE])

    await svc.choose('rpcs3')

    expect(saved.size).toBe(0)
  })
})
