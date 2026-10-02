import { describe, expect, it } from 'vitest'
import { Secret } from '@shared/secret'
import { REDACTED, redactText, redactValue } from './redact'

describe('redactText', () => {
  it.each([
    ['a Bearer token', 'Bearer abc.def-ghi_123', `Bearer ${REDACTED}`],
    ['a Basic credential', 'Basic dXNlcjpwYXNz', `Basic ${REDACTED}`],
    ['an Authorization header', 'Authorization: Bearer xyz', `Authorization: ${REDACTED}`],
    ['a Cookie header', 'Cookie: a=b; c=d', `Cookie: ${REDACTED}`],
    ['a Set-Cookie header', 'Set-Cookie: sid=1; Path=/', `Set-Cookie: ${REDACTED}`],
    [
      'an access_token parameter',
      'GET /x?access_token=abc123&page=2',
      `GET /x?access_token=${REDACTED}&page=2`,
    ],
    ['a key parameter', 'key=abc', `key=${REDACTED}`],
    ['an npsso parameter', 'npsso=AbCd', `npsso=${REDACTED}`],
    ['a name in capitals', 'TOKEN=abc', `TOKEN=${REDACTED}`],
    ['a JSON token field', '{"npsso":"abcd","n":1}', `{"npsso":"${REDACTED}","n":1}`],
    ['a long run of letters and digits', `id ${'a'.repeat(32)}`, `id ${REDACTED}`],
    ['a long id with dashes', `${'ab12'.repeat(9)}`, REDACTED],
  ])('redacts %s', (_label, input, expected) => {
    expect(redactText(input)).toBe(expected)
  })

  it.each([
    ['plain text', 'Synced 12 games for Steam'],
    [
      'a url with a long path',
      'https://m.np.playstation.com/api/trophy/v1/users/me/trophyTitles?limit=800',
    ],
    ['a name that only ends in code', 'error_code=5'],
    ['a run one short of the limit', 'a'.repeat(31)],
    ['a timestamp', '2026-10-02T12:00:00.000Z'],
  ])('leaves %s alone', (_label, input) => {
    expect(redactText(input)).toBe(input)
  })

  it('cuts a very long message after redacting it', () => {
    const result = redactText(`${'word '.repeat(1000)}`)

    expect(result.length).toBeLessThan(2100)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('redactValue', () => {
  it('passes numbers, booleans and null through', () => {
    expect(redactValue(5)).toBe(5)
    expect(redactValue(true)).toBe(true)
    expect(redactValue(null)).toBeNull()
  })

  it('redacts text inside strings', () => {
    expect(redactValue('token=abc')).toBe(`token=${REDACTED}`)
  })

  it('hides a Secret, even deep inside an object', () => {
    expect(redactValue({ a: { b: new Secret('hunter2') } })).toEqual({
      a: { b: 'Secret(<redacted>)' },
    })
  })

  it('hides the value of any key named like a credential', () => {
    expect(redactValue({ token: 'abc', Password: 'x', name: 'Portal' })).toEqual({
      token: REDACTED,
      Password: REDACTED,
      name: 'Portal',
    })
  })

  it('keeps an error as name, message and stack, all redacted', () => {
    const error = new Error('bad token=abc')

    const result = redactValue(error) as { name: string; message: string; stack: string }

    expect(result.name).toBe('Error')
    expect(result.message).toBe(`bad token=${REDACTED}`)
    expect(result.stack).not.toContain('token=abc')
  })

  it('walks arrays', () => {
    expect(redactValue(['key=a', 2])).toEqual([`key=${REDACTED}`, 2])
  })

  it('writes a date as ISO text', () => {
    expect(redactValue(new Date('2026-10-02T12:00:00.000Z'))).toBe('2026-10-02T12:00:00.000Z')
  })

  it('stops at four levels, so a circular object cannot loop', () => {
    const loop: Record<string, unknown> = {}
    loop.self = loop

    const result = JSON.stringify(redactValue(loop))

    expect(result).toContain('…')
  })
})
