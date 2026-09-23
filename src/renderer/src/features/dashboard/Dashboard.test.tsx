// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { SAMPLE_STATS } from './sample-stats'
import { Dashboard } from './Dashboard'

afterEach(cleanup)

describe('Dashboard', () => {
  it('shows a loading status before the stats arrive', () => {
    render(<Dashboard />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('shows the sample stats once loaded, then clears the loading status', async () => {
    render(<Dashboard />)

    expect(await screen.findByText('68%')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    expect(screen.getByText(SAMPLE_STATS.gamesTracked.toLocaleString())).toBeInTheDocument()
    expect(screen.getByText(SAMPLE_STATS.completedGames.toLocaleString())).toBeInTheDocument()
    expect(screen.getByText(SAMPLE_STATS.unlockedThisWeek.toLocaleString())).toBeInTheDocument()
  })

  it('still loads correctly under StrictMode, where effects run twice', async () => {
    render(
      <StrictMode>
        <Dashboard />
      </StrictMode>,
    )

    expect(await screen.findByText('68%')).toBeInTheDocument()
  })
})
