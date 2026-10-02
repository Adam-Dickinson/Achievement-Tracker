import { Secret } from '@shared/secret'

export const REDACTED = '[redacted]'

const MAX_STRING = 2000
const MAX_DEPTH = 4
const NAME_PATTERN =
  '(?:[A-Za-z0-9_-]*(?:token|secret|key|password|session|sessionid|session_id|ticket|npsso|cookie|authorization)|code)'
const SENSITIVE_NAME = new RegExp(`^${NAME_PATTERN}$`, 'i')
const HEADER_VALUE = /\b(Cookie|Set-Cookie|Authorization)(\s*[:=]\s*)[^\r\n]+/gi
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi
const PAIR = new RegExp(
  String.raw`(?<![A-Za-z0-9_-])(["']?)(${NAME_PATTERN})(\1\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^&\s"',;}]+)`,
  'gi',
)
const LONG_RUN = /[A-Za-z0-9_-]{32,}/g

function maskPair(_match: string, quote: string, name: string, separator: string, value: string) {
  const mark = value.startsWith('"') || value.startsWith("'") ? value[0] : ''
  return `${quote}${name}${separator}${mark}${REDACTED}${mark}`
}

export function redactText(text: string): string {
  const redacted = text
    .replace(HEADER_VALUE, `$1$2${REDACTED}`)
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(PAIR, maskPair)
    .replace(LONG_RUN, REDACTED)
  return redacted.length > MAX_STRING ? `${redacted.slice(0, MAX_STRING)}…` : redacted
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (value instanceof Secret) return String(value)
  if (typeof value === 'string') return redactText(value)
  if (value === null || value === undefined) return value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    return redactText(String(value))
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      stack: value.stack === undefined ? undefined : redactText(value.stack),
    }
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
  }
  if (depth >= MAX_DEPTH) return '[…]'
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_NAME.test(key) ? REDACTED : redactValue(item, depth + 1),
    ]),
  )
}
