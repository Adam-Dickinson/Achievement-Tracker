import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { childrenNamed, childText, parseXml } from './xml'

function parseError(source: string): ProviderError {
  try {
    parseXml(source, 'Test')
  } catch (err) {
    if (err instanceof ProviderError) return err
    throw err
  }
  throw new Error('expected a parse error')
}

describe('parseXml', () => {
  it('reads elements, attributes and text, skipping the declaration and comments', () => {
    const root = parseXml(
      `<?xml version="1.0"?>
<!--Sce-Np-Trophy-Signature: abc-->
<trophyconf version="1.1" platform='ps4'>
  <npcommid>NPWR05818_00</npcommid>
  <trophy id="000" hidden="no" />
</trophyconf>`,
      'Test',
    )

    expect(root.name).toBe('trophyconf')
    expect(root.attributes).toEqual({ version: '1.1', platform: 'ps4' })
    expect(childText(root, 'npcommid')).toBe('NPWR05818_00')
    expect(childrenNamed(root, 'trophy')[0]?.attributes).toEqual({ id: '000', hidden: 'no' })
  })

  it('decodes named and numeric entities in text and attributes', () => {
    const root = parseXml(
      '<a title="Tom &amp; Jerry &#x27;s">Line one,&#x0a;line two &lt;3 &#233;</a>',
      'Test',
    )

    expect(root.attributes.title).toBe("Tom & Jerry 's")
    expect(root.text).toBe('Line one,\nline two <3 é')
  })

  it('keeps CDATA as it is', () => {
    expect(parseXml('<a><![CDATA[<b>&amp;</b>]]></a>', 'Test').text).toBe('<b>&amp;</b>')
  })

  it('trims the text of an element', () => {
    expect(parseXml('<name>  Bloodborne </name>', 'Test').text).toBe('Bloodborne')
  })

  it.each([
    ['an unclosed element', '<a><b></b>'],
    ['a mismatched closing tag', '<a></b>'],
    ['two root elements', '<a/><b/>'],
    ['text outside the root', 'hello <a/>'],
    ['no root at all', '<!-- nothing -->'],
    ['a stray "<"', '<a>1 < 2</a>'],
    ['an unknown entity', '<a>&nbsp;</a>'],
    ['a bare "&"', '<a>fish & chips</a>'],
    ['an invalid character reference', '<a>&#0;</a>'],
    ['a duplicate attribute', '<a id="1" id="2"/>'],
    ['nesting too deep', `${'<a>'.repeat(40)}${'</a>'.repeat(40)}`],
  ])('rejects %s with a parse error naming the file', (_case, source) => {
    const error = parseError(source)

    expect(error.kind).toBe('parse')
    expect(error.message).toMatch(/^Test: /)
  })
})
