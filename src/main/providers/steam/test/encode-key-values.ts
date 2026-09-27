export interface Float {
  readonly float: number
}
export type Value = string | number | Float | Tree
export interface Tree {
  readonly [key: string]: Value
}

export function encode(tree: Tree): Buffer {
  const parts: Buffer[] = []
  const text = (value: string): Buffer => Buffer.concat([Buffer.from(value, 'utf8'), Buffer.of(0)])
  const write = (node: Tree): void => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        parts.push(Buffer.of(1), text(key), text(value))
      } else if (typeof value === 'number') {
        const int = Buffer.alloc(4)
        int.writeInt32LE(value)
        parts.push(Buffer.of(2), text(key), int)
      } else if ('float' in value && typeof value.float === 'number') {
        const float = Buffer.alloc(4)
        float.writeFloatLE(value.float)
        parts.push(Buffer.of(3), text(key), float)
      } else {
        parts.push(Buffer.of(0), text(key))
        write(value as Tree)
        parts.push(Buffer.of(8))
      }
    }
  }
  write(tree)
  parts.push(Buffer.of(8))
  return Buffer.concat(parts)
}
