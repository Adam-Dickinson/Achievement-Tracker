import { watch } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { ProviderError } from '@shared/errors'

const BYTE_ORDER_MARK = 0xfeff

export interface FolderEntry {
  readonly name: string
  readonly isDirectory: boolean
  readonly modifiedAt: Date
}

export interface LocalFiles {
  readonly readText: (path: string, maxBytes: number) => Promise<string | null>
  readonly listFolder: (path: string) => Promise<readonly FolderEntry[] | null>
  readonly watchFolder: (path: string, onFile: (name: string) => void) => () => void
}

function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export async function readText(path: string, maxBytes: number): Promise<string | null> {
  let file
  try {
    file = await open(path, 'r')
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
  try {
    const { size } = await file.stat()
    if (size > maxBytes) {
      throw new ProviderError('parse', `${basename(path)} is larger than ${maxBytes} bytes`)
    }
    const text = await file.readFile('utf8')
    return text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text
  } finally {
    await file.close()
  }
}

export async function listFolder(path: string): Promise<readonly FolderEntry[] | null> {
  let names: string[]
  try {
    names = await readdir(path)
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const info = await stat(join(path, name))
        return { name, isDirectory: info.isDirectory(), modifiedAt: info.mtime }
      } catch (err) {
        if (isMissing(err)) return null
        throw err
      }
    }),
  )
  return entries.filter((entry) => entry !== null)
}

export function watchFolder(path: string, onFile: (name: string) => void): () => void {
  try {
    const watcher = watch(path, (_event, name) => {
      if (name) onFile(name)
    })
    watcher.on('error', (err) => {
      console.warn(`Stopped watching ${path}`, err)
      watcher.close()
    })
    return () => watcher.close()
  } catch (err) {
    console.warn(`Could not watch ${path}`, err)
    return () => undefined
  }
}

export const LOCAL_FILES: LocalFiles = { readText, listFolder, watchFolder }
