// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityPage,
  MAX_ACTIVITY_LIMIT,
  type RecentUnlock,
} from '@shared/library'
import { fakeApi } from '@/test/fake-api'
import { formatTime } from '@/lib/format'
import { Activity } from './Activity'

function daysAgo(days: number, hour: number, minute = 0): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, minute)
}

function unlock(overrides: Partial<RecentUnlock> = {}): RecentUnlock {
  return {
    achievementId: 1,
    gameId: 3,
    platformGameId: 30,
    gameTitle: 'Elden Ring',
    platform: 'steam',
    name: 'Age of the Stars',
    description: 'Achieve the "Age of the Stars" ending',
    iconUrl: null,
    globalPercent: 1.2,
    unlockedAt: daysAgo(0, 0, 30),
    ...overrides,
  }
}

const TODAY = unlock()
const TODAY_XBOX = unlock({
  achievementId: 2,
  gameId: 4,
  gameTitle: 'Forza Horizon 6',
  platform: 'xbox',
  name: 'First Win',
  description: null,
  globalPercent: 64,
  unlockedAt: daysAgo(0, 0, 10),
})
const OLDER = unlock({ achievementId: 3, name: 'Elden Lord', unlockedAt: daysAgo(3, 12) })

const listActivity = vi.fn<(limit: number) => Promise<ActivityPage>>()
let dataChanged: () => void = () => {}
const onOpenGame = vi.fn()

beforeEach(() => {
  window.api = fakeApi({
    listActivity,
    onDataChanged: (listener) => {
      dataChanged = listener
      return () => {}
    },
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Activity', () => {
  it('shows a loading status before the unlocks arrive', () => {
    listActivity.mockReturnValue(new Promise(() => {}))
    render(<Activity onOpenGame={onOpenGame} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('asks for the first page of unlocks', async () => {
    listActivity.mockResolvedValue({ unlocks: [TODAY], hasMore: false })
    render(<Activity onOpenGame={onOpenGame} />)

    await screen.findByText('Age of the Stars')
    expect(listActivity).toHaveBeenCalledWith(ACTIVITY_PAGE_SIZE)
  })

  it('groups unlocks under a heading for each day, with a count', async () => {
    listActivity.mockResolvedValue({ unlocks: [TODAY, TODAY_XBOX, OLDER], hasMore: false })
    render(<Activity onOpenGame={onOpenGame} />)

    const today = await screen.findByRole('region', { name: 'Today' })
    expect(
      within(today)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining('Age of the Stars'), expect.stringContaining('First Win')])
    expect(today).toHaveTextContent('2 unlocks')

    const older = OLDER.unlockedAt.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const earlier = screen.getByRole('region', { name: older })
    expect(within(earlier).getByRole('button')).toHaveTextContent('Elden Lord')
    expect(earlier).toHaveTextContent('1 unlock')
  })

  it('shows each unlock with its description, game, platform, rarity and time', async () => {
    listActivity.mockResolvedValue({ unlocks: [TODAY, TODAY_XBOX], hasMore: false })
    render(<Activity onOpenGame={onOpenGame} />)

    const row = await screen.findByRole('button', { name: /Age of the Stars/ })
    expect(row).toHaveTextContent('Achieve the "Age of the Stars" ending')
    expect(row).toHaveTextContent('Elden Ring · Steam')
    expect(row).toHaveTextContent('Ultra Rare')
    expect(row).toHaveTextContent('1.2%')
    expect(row).toHaveTextContent(formatTime(TODAY.unlockedAt))

    expect(screen.getByRole('button', { name: /First Win/ })).toHaveTextContent(
      'Forza Horizon 6 · Xbox',
    )
  })

  it('opens the game when an unlock is clicked', async () => {
    listActivity.mockResolvedValue({ unlocks: [TODAY_XBOX], hasMore: false })
    render(<Activity onOpenGame={onOpenGame} />)

    fireEvent.click(await screen.findByRole('button', { name: /First Win/ }))

    expect(onOpenGame).toHaveBeenCalledWith(4, 30)
  })

  it('says when nothing has been unlocked yet', async () => {
    listActivity.mockResolvedValue({ unlocks: [], hasMore: false })
    render(<Activity onOpenGame={onOpenGame} />)

    expect(await screen.findByText(/Nothing unlocked yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('asks for a bigger page when "Show more" is clicked, keeping the list meanwhile', async () => {
    listActivity
      .mockResolvedValueOnce({ unlocks: [TODAY], hasMore: true })
      .mockResolvedValueOnce({ unlocks: [TODAY, OLDER], hasMore: false })
    render(<Activity onOpenGame={onOpenGame} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))
    expect(screen.getByText('Age of the Stars')).toBeInTheDocument()

    expect(await screen.findByText('Elden Lord')).toBeInTheDocument()
    expect(listActivity).toHaveBeenLastCalledWith(ACTIVITY_PAGE_SIZE * 2)
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('stops offering more at the largest page the main process allows', async () => {
    listActivity.mockResolvedValue({ unlocks: [TODAY], hasMore: true })
    render(<Activity onOpenGame={onOpenGame} />)

    for (let limit = ACTIVITY_PAGE_SIZE; limit < MAX_ACTIVITY_LIMIT; limit += ACTIVITY_PAGE_SIZE) {
      fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))
    }

    await vi.waitFor(() => expect(listActivity).toHaveBeenLastCalledWith(MAX_ACTIVITY_LIMIT))
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('reloads the same number of unlocks when the main process says the data changed', async () => {
    listActivity
      .mockResolvedValueOnce({ unlocks: [TODAY], hasMore: false })
      .mockResolvedValueOnce({ unlocks: [TODAY_XBOX, TODAY], hasMore: false })
    render(<Activity onOpenGame={onOpenGame} />)
    await screen.findByText('Age of the Stars')

    act(() => dataChanged())

    expect(await screen.findByText('First Win')).toBeInTheDocument()
    expect(listActivity).toHaveBeenLastCalledWith(ACTIVITY_PAGE_SIZE)
  })

  it('still loads under StrictMode, where effects run twice', async () => {
    listActivity.mockResolvedValue({ unlocks: [TODAY], hasMore: false })
    render(
      <StrictMode>
        <Activity onOpenGame={onOpenGame} />
      </StrictMode>,
    )

    expect(await screen.findByText('Age of the Stars')).toBeInTheDocument()
  })
})
