import { open } from 'node:fs/promises'
import type { ByteSource } from './iso9660'

export function fileByteSource(path: string): ByteSource {
  return {
    async read(position, length) {
      const handle = await open(path, 'r')
      try {
        const buffer = Buffer.alloc(length)
        let total = 0
        while (total < length) {
          const { bytesRead } = await handle.read(buffer, total, length - total, position + total)
          if (bytesRead === 0) break
          total += bytesRead
        }
        return buffer.subarray(0, total)
      } finally {
        await handle.close()
      }
    },
  }
}
