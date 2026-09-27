// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PLATFORMS, platformName } from '@shared/platform'
import { PlatformBadge } from './PlatformBadge'

afterEach(cleanup)

describe('PlatformBadge', () => {
  it.each(PLATFORMS)('names %s for screen readers and takes its colours', (platform) => {
    render(<PlatformBadge platform={platform} />)

    const badge = screen.getByRole('img', { name: platformName(platform) })
    expect(badge).toHaveAttribute('data-platform', platform)
    expect(badge.querySelector('svg')).not.toBeNull()
  })

  it('draws at the size it is given', () => {
    render(<PlatformBadge platform="steam" size={30} />)

    expect(screen.getByRole('img', { name: 'Steam' })).toHaveStyle({
      width: '30px',
      height: '30px',
    })
  })
})
