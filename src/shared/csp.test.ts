import { describe, expect, it } from 'vitest'
import { PRODUCTION_CSP } from './csp'

describe('PRODUCTION_CSP', () => {
  it('allows trophy-art images alongside self, data and https', () => {
    const img = PRODUCTION_CSP.split('; ').find((part) => part.startsWith('img-src '))

    expect(img?.split(' ')).toEqual(
      expect.arrayContaining(["'self'", 'data:', 'https:', 'trophy-art:']),
    )
  })

  it('is exactly the intended policy', () => {
    expect(PRODUCTION_CSP).toBe(
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: trophy-art:",
        "font-src 'self' data:",
        "connect-src 'self'",
      ].join('; '),
    )
  })
})
