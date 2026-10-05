import { open } from 'node:fs/promises'
import type { ByteSource } from './iso9660'

export function fileByteSource(path: string): ByteSource {
  return {
    async read(position, length) {
      const handle = await open(path, 'r')
      try {
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, position)
        return buffer.subarray(0, bytesRead)
      } finally {
        await handle.close()
      }
    },
  }
}
