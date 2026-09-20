import { describe, expect, it } from 'vitest'
import { isUnofficial, PLATFORM_INFO, PLATFORMS, platformName } from './platform'

describe('platforms', () => {
  it('has unique ids', () => {
    expect(new Set(PLATFORMS).size).toBe(PLATFORMS.length)
  })

  it('describes every platform', () => {
    for (const platform of PLATFORMS) {
      expect(PLATFORM_INFO[platform].displayName).not.toBe('')
      expect(platformName(platform)).toBe(PLATFORM_INFO[platform].displayName)
    }
  })

  it('flags only unofficial integrations as unofficial', () => {
    expect(isUnofficial('steam')).toBe(false)
    expect(isUnofficial('retroachievements')).toBe(false)
    expect(isUnofficial('playstation')).toBe(true)
  })
})
