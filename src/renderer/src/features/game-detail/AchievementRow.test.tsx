// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameAchievement } from '@shared/library'
import { AchievementRow } from './AchievementRow'

afterEach(cleanup)

function achievement(overrides: Partial<GameAchievement> = {}): GameAchievement {
  return {
    id: 1,
    name: 'Age of the Stars',
    description: 'Reach the ending in which Ranni becomes your consort.',
    hidden: false,
    iconUrl: 'https://icon/colour.jpg',
    iconLockedUrl: 'https://icon/grey.jpg',
    globalPercent: 1.2,
    platinum: false,
    unlocked: true,
    unlockedAt: new Date(2026, 2, 9, 12, 0),
    ...overrides,
  }
}

function renderRow(overrides: Partial<GameAchievement> = {}) {
  return render(<AchievementRow achievement={achievement(overrides)} />)
}

const row = () => document.body.querySelector('[data-rarity]') as HTMLElement

describe('AchievementRow', () => {
  it('shows an unlocked achievement with its colour icon, date, percentage and rarity', () => {
    const { container } = renderRow()

    expect(row()).toHaveTextContent('Age of the Stars')
    expect(row()).toHaveTextContent('Reach the ending')
    expect(row()).toHaveTextContent('1.2%')
    expect(row()).toHaveTextContent('Ultra Rare')
    expect(row()).toHaveTextContent(
      new Date(2026, 2, 9).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://icon/colour.jpg')
    expect(row()).toHaveAttribute('data-rarity', 'ultra_rare')
  })

  it('marks a platinum with a Platinum chip and the platinum colours', () => {
    renderRow({ platinum: true })

    expect(row()).toHaveTextContent('Platinum')
    expect(row()).toHaveAttribute('data-platinum')
  })

  it('gives other achievements no Platinum chip', () => {
    renderRow()

    expect(row()).not.toHaveTextContent('Platinum')
    expect(row()).not.toHaveAttribute('data-platinum')
  })

  it('shows a locked achievement with its grey icon', () => {
    const { container } = renderRow({ unlocked: false, unlockedAt: null })

    expect(row()).toHaveTextContent('Locked')
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://icon/grey.jpg')
  })

  it('says Unlocked when the platform gave no date', () => {
    renderRow({ unlockedAt: null })

    expect(row()).toHaveTextContent('Unlocked')
  })

  it('keeps a hidden achievement secret until it is unlocked', () => {
    const { container, rerender } = renderRow({
      hidden: true,
      unlocked: false,
      unlockedAt: null,
      description: null,
    })
    expect(row()).toHaveTextContent('Hidden achievement')
    expect(row()).toHaveTextContent('revealed once you unlock it')
    expect(row()).not.toHaveTextContent('Age of the Stars')
    expect(container.querySelector('img')).toBeNull()

    rerender(<AchievementRow achievement={achievement({ hidden: true, description: null })} />)
    expect(row()).toHaveTextContent('Age of the Stars')
  })

  it('leaves out the percentage and rarity when the platform has none', () => {
    renderRow({ globalPercent: null })

    expect(row()).not.toHaveTextContent('%')
    expect(row()).not.toHaveTextContent('Common')
  })

  it('falls back to a plain icon when the image fails to load', () => {
    const { container } = renderRow()
    const img = container.querySelector('img')
    if (!img) throw new Error('expected the icon')

    fireEvent.error(img)

    expect(container.querySelector('img')).toBeNull()
  })
})
