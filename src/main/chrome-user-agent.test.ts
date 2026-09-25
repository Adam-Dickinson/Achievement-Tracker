import { describe, expect, it } from 'vitest'
import { chromeUserAgent } from './chrome-user-agent'

describe('chromeUserAgent', () => {
  it("removes Electron and the app's own name, leaving a plain Chrome user agent", () => {
    const electron =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) trophy-locker/0.1.0 Chrome/152.0.7977.130 Electron/41.0.0 Safari/537.36'

    expect(chromeUserAgent(electron)).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36',
    )
  })

  it('leaves a Chrome user agent as it is', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36'

    expect(chromeUserAgent(chrome)).toBe(chrome)
  })
})
