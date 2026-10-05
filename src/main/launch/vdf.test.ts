import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { parseVdf } from './vdf'

describe('parseVdf', () => {
  it('reads nested objects and string values', () => {
    const text = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"
\t\t"apps"
\t\t{
\t\t\t"220"\t\t"1234"
\t\t}
\t}
}`

    expect(parseVdf(text)).toEqual({
      libraryfolders: {
        '0': { path: 'C:\\Program Files (x86)\\Steam', apps: { '220': '1234' } },
      },
    })
  })

  it('treats a quoted brace as text', () => {
    expect(parseVdf('"a" "{"')).toEqual({ a: '{' })
  })

  it('throws a parse error on an unclosed object', () => {
    expect(() => parseVdf('"a" { "b" "c"')).toThrow(ProviderError)
  })

  it('throws a parse error on a key with no value', () => {
    expect(() => parseVdf('"a"')).toThrow(ProviderError)
  })
})
