// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameAchievement, GameEntry } from '@shared/library'
import { formatUnlockDate } from '@/lib/format'
import { PlatinumBanner } from './PlatinumBanner'

afterEach(cleanup)

const EARNED = new Date(2026, 8, 26, 10, 28)

function achievement(id: number, overrides: Partial<GameAchievement> = {}): GameAchievement {
  return {
    id,
    name: `Achievement ${id}`,
    description: null,
    hidden: false,
    iconUrl: null,
    iconLockedUrl: null,
    globalPercent: 20,
    platinum: false,
    unlocked: false,
    unlockedAt: null,
    ...overrides,
  }
}

function entry(
  achievements: readonly GameAchievement[],
  overrides: Partial<GameEntry> = {},
): GameEntry {
  return {
    platformGameId: 1,
    platform: 'steam',
    tag: null,
    title: 'Elden Ring',
    unlocked: achievements.filter((a) => a.unlocked).length,
    total: achievements.length,
    achievements,
    appPlatinum: null,
    hasStorePage: false,
    ...overrides,
  }
}

const banner = () => screen.getByRole('region', { name: 'Platinum' })
const done = (id: number) => achievement(id, { unlocked: true, unlockedAt: EARNED })
const own = (overrides: Partial<GameAchievement> = {}) =>
  achievement(9, { name: 'Elden Ring', platinum: true, ...overrides })

describe('PlatinumBanner', () => {
  it("shows the game's own platinum once earned, with its date", () => {
    render(<PlatinumBanner entry={entry([done(1), own({ unlocked: true, unlockedAt: EARNED })])} />)

    expect(banner()).toHaveTextContent('Elden Ring')
    expect(banner()).toHaveTextContent(`Earned ${formatUnlockDate(EARNED)}`)
    expect(banner()).toHaveAttribute('data-platinum')
  })

  it('counts what is left before its own platinum', () => {
    render(<PlatinumBanner entry={entry([done(1), achievement(2), achievement(3), own()])} />)

    expect(banner()).toHaveTextContent('2 achievements to go')
    expect(banner()).not.toHaveAttribute('data-platinum')
  })

  it('says when only its own platinum is still to come', () => {
    render(<PlatinumBanner entry={entry([done(1), own()])} />)

    expect(banner()).toHaveTextContent('Every other achievement is unlocked')
  })

  it('keeps a hidden platinum secret until it is earned', () => {
    render(<PlatinumBanner entry={entry([achievement(1), own({ hidden: true })])} />)

    expect(banner()).not.toHaveTextContent('Elden Ring')
    expect(banner()).toHaveTextContent('1 achievement to go')
  })

  it('shows the app-awarded Platinum for a game without its own', () => {
    render(
      <PlatinumBanner entry={entry([done(1), done(2)], { appPlatinum: { earnedAt: EARNED } })} />,
    )

    expect(banner()).toHaveTextContent('Every achievement in Elden Ring')
    expect(banner()).toHaveTextContent(`Earned ${formatUnlockDate(EARNED)}`)
    expect(banner()).toHaveAttribute('data-platinum')
  })

  it('says it was earned when the platform gave no dates', () => {
    render(<PlatinumBanner entry={entry([done(1)], { appPlatinum: { earnedAt: null } })} />)

    expect(banner()).toHaveTextContent('Earned')
  })

  it('explains how to earn the Platinum of a game without its own', () => {
    render(<PlatinumBanner entry={entry([done(1), achievement(2), achievement(3)])} />)

    expect(banner()).toHaveTextContent("Unlock all 3 achievements to earn this game's Platinum")
    expect(banner()).toHaveTextContent('2 achievements to go')
  })

  it('shows nothing for a game whose achievements have not been read', () => {
    const { container } = render(<PlatinumBanner entry={entry([])} />)

    expect(container).toBeEmptyDOMElement()
  })
})
