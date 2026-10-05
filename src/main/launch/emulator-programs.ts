import { win32 } from 'node:path'
import type { EmulatorId, EmulatorProgram } from '@shared/launch'

const EXE_NAMES: Record<EmulatorId, string> = { rpcs3: 'rpcs3.exe' }

export interface EmulatorProgramsDeps {
  readonly read: (emulator: EmulatorId) => string | null
  readonly save: (emulator: EmulatorId, path: string) => void
  readonly dataDirs: (emulator: EmulatorId) => string[]
  readonly fileExists: (path: string) => Promise<boolean>
  readonly chooseFile: () => Promise<string | null>
  readonly onChanged: () => void
}

export class EmulatorPrograms {
  readonly #deps: EmulatorProgramsDeps

  constructor(deps: EmulatorProgramsDeps) {
    this.#deps = deps
  }

  async list(): Promise<EmulatorProgram[]> {
    return [await this.#describe('rpcs3')]
  }

  async resolve(emulator: EmulatorId, dataDir: string): Promise<string | null> {
    const saved = await this.#savedProgram(emulator)
    if (saved !== null) return saved
    const beside = win32.join(dataDir, EXE_NAMES[emulator])
    return (await this.#deps.fileExists(beside)) ? beside : null
  }

  async choose(emulator: EmulatorId): Promise<EmulatorProgram> {
    const chosen = await this.#deps.chooseFile()
    if (chosen !== null && isProgramPath(chosen) && (await this.#deps.fileExists(chosen))) {
      this.#deps.save(emulator, chosen)
      this.#deps.onChanged()
    }
    return this.#describe(emulator)
  }

  async #savedProgram(emulator: EmulatorId): Promise<string | null> {
    const saved = this.#deps.read(emulator)
    return saved !== null && isProgramPath(saved) && (await this.#deps.fileExists(saved))
      ? saved
      : null
  }

  async #describe(emulator: EmulatorId): Promise<EmulatorProgram> {
    const saved = await this.#savedProgram(emulator)
    if (saved !== null) return { emulator, path: saved, source: 'chosen' }
    for (const dir of this.#deps.dataDirs(emulator)) {
      const beside = win32.join(dir, EXE_NAMES[emulator])
      if (await this.#deps.fileExists(beside)) return { emulator, path: beside, source: 'found' }
    }
    return { emulator, path: null, source: null }
  }
}

function isProgramPath(path: string): boolean {
  return win32.isAbsolute(path) && path.toLowerCase().endsWith('.exe')
}
