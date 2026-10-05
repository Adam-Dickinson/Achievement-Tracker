import { access } from 'node:fs/promises'
import { join } from 'node:path'

export async function findRpcs3Program(dataDir: string): Promise<string | null> {
  const candidate = join(dataDir, 'rpcs3.exe')
  try {
    await access(candidate)
    return candidate
  } catch {
    return null
  }
}
