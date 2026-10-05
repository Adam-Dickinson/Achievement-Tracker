import { ProviderError } from '@shared/errors'

export type VdfValue = string | VdfObject
export interface VdfObject {
  [key: string]: VdfValue
}

type Token = { kind: 'text'; text: string } | { kind: 'open' } | { kind: 'close' }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '{') {
      tokens.push({ kind: 'open' })
      i++
    } else if (ch === '}') {
      tokens.push({ kind: 'close' })
      i++
    } else if (ch === '"') {
      let value = ''
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          i++
          const next = text[i]
          value += next === 'n' ? '\n' : next === 't' ? '\t' : (next ?? '')
        } else {
          value += text[i] ?? ''
        }
        i++
      }
      if (i >= text.length)
        throw new ProviderError('parse', 'Steam: unterminated string in a VDF file')
      i++
      tokens.push({ kind: 'text', text: value })
    } else {
      i++
    }
  }
  return tokens
}

export function parseVdf(text: string): VdfObject {
  const tokens = tokenize(text)
  let pos = 0

  function readObject(nested: boolean): VdfObject {
    const result: VdfObject = {}
    for (;;) {
      const key = tokens[pos++]
      if (key === undefined) {
        if (nested) throw new ProviderError('parse', 'Steam: unclosed object in a VDF file')
        return result
      }
      if (key.kind === 'close') {
        if (!nested) throw new ProviderError('parse', 'Steam: unexpected } in a VDF file')
        return result
      }
      if (key.kind === 'open') throw new ProviderError('parse', 'Steam: unexpected { in a VDF file')
      const value = tokens[pos++]
      if (value === undefined || value.kind === 'close') {
        throw new ProviderError('parse', `Steam: no value for "${key.text}" in a VDF file`)
      }
      result[key.text] = value.kind === 'open' ? readObject(true) : value.text
    }
  }

  return readObject(false)
}
