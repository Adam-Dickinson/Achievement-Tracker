import { ProviderError } from '@shared/errors'

export interface XmlElement {
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly children: readonly XmlElement[]
  readonly text: string
}

const MAX_DEPTH = 32
const NAME = '[A-Za-z_][\\w.:-]*'
const TOKEN = new RegExp(
  [
    '<!--[\\s\\S]*?-->',
    '<\\?[\\s\\S]*?\\?>',
    '<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>',
    `<\\/(${NAME})\\s*>`,
    `<(${NAME})((?:\\s+${NAME}\\s*=\\s*(?:"[^"<]*"|'[^'<]*'))*)\\s*(\\/?)>`,
    '([^<]+)',
    '(<)',
  ].join('|'),
  'g',
)
const ATTRIBUTE = new RegExp(`(${NAME})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'g')
const ENTITY = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);|&/g
const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

interface Building {
  readonly name: string
  readonly attributes: Record<string, string>
  readonly children: XmlElement[]
  text: string
}

export function parseXml(source: string, label: string): XmlElement {
  const fail = (reason: string): never => {
    throw new ProviderError('parse', `${label}: ${reason}`)
  }
  const stack: Building[] = []
  let root: XmlElement | null = null

  const close = (element: Building): void => {
    const done: XmlElement = { ...element, text: element.text.trim() }
    const parent = stack.at(-1)
    if (parent) parent.children.push(done)
    else if (root) fail('more than one root element')
    else root = done
  }

  for (const match of source.matchAll(TOKEN)) {
    const [, cdata, closing, opening, attributes, selfClosing, text, stray] = match
    if (stray !== undefined) fail('malformed markup')
    if (text !== undefined || cdata !== undefined) {
      const value = cdata ?? decode(text ?? '', fail)
      const current = stack.at(-1)
      if (current) current.text += value
      else if (value.trim() !== '') fail('text outside the root element')
    } else if (closing !== undefined) {
      const element = stack.pop()
      if (element?.name !== closing) fail(`unexpected </${closing}>`)
      else close(element)
    } else if (opening !== undefined) {
      if (root) fail('more than one root element')
      const element: Building = {
        name: opening,
        attributes: readAttributes(attributes ?? '', fail),
        children: [],
        text: '',
      }
      if (selfClosing) close(element)
      else if (stack.push(element) > MAX_DEPTH) fail('nested too deeply')
    }
  }

  if (stack.length > 0) fail(`<${stack.at(-1)?.name}> is never closed`)
  return root ?? fail('no root element')
}

function readAttributes(source: string, fail: (reason: string) => never): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const [, name = '', doubleQuoted, singleQuoted] of source.matchAll(ATTRIBUTE)) {
    if (Object.hasOwn(attributes, name)) fail(`attribute "${name}" appears twice`)
    attributes[name] = decode(doubleQuoted ?? singleQuoted ?? '', fail)
  }
  return attributes
}

function decode(value: string, fail: (reason: string) => never): string {
  return value.replace(ENTITY, (whole, entity: string | undefined) => {
    if (entity === undefined) return fail('a bare "&"')
    if (!entity.startsWith('#')) return NAMED[entity] ?? fail(`unknown entity &${entity};`)
    const code = entity.startsWith('#x')
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10)
    const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
    return valid ? String.fromCodePoint(code) : fail(`invalid character reference ${whole}`)
  })
}

export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name)
}

export function childText(element: XmlElement, name: string): string | null {
  return element.children.find((child) => child.name === name)?.text ?? null
}
