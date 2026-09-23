// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountSummary } from '@shared/ipc'
import type { AccountStatus } from '@shared/models'
import { AccountCard } from './AccountCard'

afterEach(cleanup)

function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: 1,
    platform: 'steam',
    displayName: 'Test Player',
    status: 'connected',
    gameCount: 12,
    ...overrides,
  }
}

describe('AccountCard', () => {
  it('shows the platform, the display name, the status and the game count', () => {
    render(<AccountCard account={account()} />)

    expect(screen.getByText('Steam')).toBeInTheDocument()
    expect(screen.getByText('Test Player')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('12 games')).toBeInTheDocument()
  })

  it('uses the platform name rather than its id', () => {
    render(<AccountCard account={account({ platform: 'retroachievements' })} />)

    expect(screen.getByText('RetroAchievements')).toBeInTheDocument()
  })

  it.each([
    [0, '0 games'],
    [1, '1 game'],
    [2, '2 games'],
  ])('says %i game(s) correctly', (gameCount, text) => {
    render(<AccountCard account={account({ gameCount })} />)

    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('groups a large game count', () => {
    render(<AccountCard account={account({ gameCount: 1204 })} />)

    // Grouping follows the machine's locale; see StatTile.test.tsx for the whitespace detail.
    const expected = `${(1204).toLocaleString()} games`.replace(/\s/g, ' ')
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it.each<[AccountStatus, string]>([
    ['connected', 'Connected'],
    ['needs_reauth', 'Needs reconnecting'],
    ['error', 'Error'],
    ['disabled', 'Disabled'],
  ])('labels the %s status', (status, label) => {
    render(<AccountCard account={account({ status })} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
