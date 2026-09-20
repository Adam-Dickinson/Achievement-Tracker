import { describe, expect, it } from 'vitest'
import { ProviderError, type ProviderErrorKind } from './errors'

describe('ProviderError', () => {
  it.each([
    ['network', true],
    ['rate_limited', true],
    ['auth_expired', false],
    ['parse', false],
    ['unsupported', false],
  ] as const satisfies readonly (readonly [ProviderErrorKind, boolean])[])(
    '%s is retryable: %s',
    (kind, expected) => {
      expect(new ProviderError(kind, 'x').isRetryable).toBe(expected)
    },
  )

  it('carries retry-after and the original cause', () => {
    const cause = new Error('boom')
    const error = new ProviderError('rate_limited', 'slow down', { retryAfterMs: 5000, cause })

    expect(error).toBeInstanceOf(Error)
    expect(error.retryAfterMs).toBe(5000)
    expect(error.cause).toBe(cause)
  })
})
