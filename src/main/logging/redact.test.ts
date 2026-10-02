import { inspect } from 'node:util'
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

  it.each([
    [
      'a JSON value with an escaped quote',
      '{"token": "a\\"b-secretpart"}',
      `{"token": "${REDACTED}"}`,
    ],
    ['an escaped quote in a password', '{"password":"p\\"w"}', `{"password":"${REDACTED}"}`],
    ['a double-quoted parameter', 'token="abc def" next', `token="${REDACTED}" next`],
    ['a single-quoted parameter', "token='abc' next", `token='${REDACTED}' next`],
    ['an unquoted value up to a space', 'password=hun ter2', `password=${REDACTED} ter2`],
    ['a camelCase name', 'accessToken=abc', `accessToken=${REDACTED}`],
    ['a client_secret name', 'client_secret=abc', `client_secret=${REDACTED}`],
    ['a session_id name', 'session_id=abc', `session_id=${REDACTED}`],
    ['a user_session name', 'user_session=abc', `user_session=${REDACTED}`],
    ['an x_api_key name', 'x_api_key=abc', `x_api_key=${REDACTED}`],
    ['a dashed X-Api-Key name', 'X-Api-Key=abc', `X-Api-Key=${REDACTED}`],
    ['a colon pair', 'token: abc', `token: ${REDACTED}`],
    ['a colon password', 'password: hunter2', `password: ${REDACTED}`],
    ['a tight colon pair', 'api_key:abc', `api_key:${REDACTED}`],
    ['spaces around equals', 'token = abc', `token = ${REDACTED}`],
    ['a numeric JSON value', '{"token": 12345}', `{"token": ${REDACTED}}`],
    ['a single-quoted pair', "{'token':'abc'}", `{'token':'${REDACTED}'}`],
  ])('also redacts %s', (_label, input, expected) => {
    expect(redactText(input)).toBe(expected)
  })

  it.each([
    ['a keyboard word', 'keyboard=us'],
    ['a dashed error code', 'error-code=5'],
    ['a code with a colon', "{ code: 'ENOENT' }"],
    ['a quoted code field', '{"code": "invalid_type"}'],
  ])('also leaves %s alone', (_label, input) => {
    expect(redactText(input)).toBe(input)
  })

  it('redacts a code given as a parameter', () => {
    expect(redactText('GET /cb?code=abc123&state=x')).toBe(`GET /cb?code=${REDACTED}&state=x`)
  })

  it('redacts a token shown by util.inspect of a Map', () => {
    const text = inspect(new Map([['token', 'tok999']]))

    expect(redactText(text)).not.toContain('tok999')
  })

  it('redacts a token shown by util.inspect of search params', () => {
    const text = inspect(new URL('https://example.test/x?token=tok999').searchParams)

    expect(redactText(text)).not.toContain('tok999')
  })

  it('cuts a very long message after redacting it', () => {
    const result = redactText(`${'word '.repeat(1000)}`)

    expect(result.length).toBeLessThan(2100)
    expect(result.endsWith('…')).toBe(true)
  })

  it('redacts a secret that straddles the cut point', () => {
    const result = redactText(`${'x '.repeat(990)}${'S'.repeat(40)} tail`)

    expect(result).not.toContain('SSSS')
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

  it.each(['accessToken', 'refresh_token', 'client_secret', 'x_api_key', 'X-Api-Key', 'authToken'])(
    'hides the value of a key named %s',
    (name) => {
      expect(redactValue({ [name]: 'abc' })).toEqual({ [name]: REDACTED })
    },
  )

  it('keeps the value of keys that only resemble credentials', () => {
    expect(redactValue({ error_code: 5, keyboard: 'us' })).toEqual({
      error_code: 5,
      keyboard: 'us',
    })
  })

  it('keeps the value of a key named code', () => {
    expect(redactValue({ code: 'ENOENT' })).toEqual({ code: 'ENOENT' })
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
