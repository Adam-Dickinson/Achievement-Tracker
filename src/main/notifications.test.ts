import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToastPayload, VisibleToast } from '@shared/ipc'
import type { RemoteAchievement, UnlockEvent } from '@shared/models'
import {
  BURST_SIZE,
  burstToast,
  MAX_VISIBLE,
  NotificationService,
  TOAST_DURATION_MS,
  unlockToast,
} from './notifications'
import { appPlatinumAchievement } from './store/platinum'

function unlock(
  externalId: string,
  overrides: Partial<RemoteAchievement> = {},
  gameTitle = 'Half-Life 2',
): UnlockEvent {
  return {
    platform: 'steam',
    gameTitle,
    unlockedAt: new Date('2026-09-23T11:59:58Z'),
    detectedAt: new Date('2026-09-23T12:00:00Z'),
    achievement: {
      externalId,
      name: `Achievement ${externalId}`,
      description: `Do thing ${externalId}`,
      iconUrl: null,
      iconLockedUrl: null,
      hidden: false,
      points: null,
      tier: null,
      globalPercent: 50,
      ...overrides,
    },
  }
}

const SAMPLE: ToastPayload = {
  heading: 'Achievement unlocked',
  rarity: 'rare',
  title: 'Sample',
  description: null,
  game: 'Game',
  platform: 'steam',
  percent: 5,
  platinum: false,
}

let frames: (readonly VisibleToast[])[]
let service: NotificationService

const onScreen = (): string[] => (frames.at(-1) ?? []).map((toast) => toast.title)

beforeEach(() => {
  vi.useFakeTimers()
  frames = []
  service = new NotificationService({ display: (toasts) => frames.push(toasts) })
})

afterEach(() => {
  service.stop()
  vi.useRealTimers()
})

describe('unlockToast', () => {
  it('turns an unlock into a toast with its platform and a rarity from the percentage', () => {
    expect(unlockToast(unlock('a', { globalPercent: 4.25 }))).toEqual({
      heading: 'Achievement unlocked',
      rarity: 'rare',
      title: 'Achievement a',
      description: 'Do thing a',
      game: 'Half-Life 2',
      platform: 'steam',
      percent: 4.3,
      platinum: false,
    })
  })

  it("marks a game's own platinum with its own heading", () => {
    const toast = unlockToast(
      unlock('p', { name: 'Elden Ring', description: 'Obtained all achievements' }, 'ELDEN RING'),
    )

    expect(toast).toMatchObject({
      heading: 'Platinum unlocked',
      title: 'Elden Ring',
      platinum: true,
    })
  })

  it("marks a platform's platinum trophy the same way", () => {
    const toast = unlockToast(unlock('p', { tier: 'platinum', description: 'Earn every trophy' }))

    expect(toast).toMatchObject({ heading: 'Platinum unlocked', platinum: true })
  })

  it('announces the app-awarded Platinum as earned, with no rarity number', () => {
    const toast = unlockToast({
      ...unlock('x', {}, 'Portal'),
      achievement: appPlatinumAchievement('Portal'),
    })

    expect(toast).toEqual({
      heading: 'Platinum earned',
      rarity: 'common',
      title: 'Platinum',
      description: 'Every achievement in Portal',
      game: 'Portal',
      platform: 'steam',
      percent: null,
      platinum: true,
    })
  })

  it('keeps two decimal places below 1%, so a very rare unlock does not read as 0%', () => {
    expect(unlockToast(unlock('a', { globalPercent: 0.04 })).percent).toBe(0.04)
    expect(unlockToast(unlock('a', { globalPercent: 0.456 })).percent).toBe(0.46)
  })

  it('falls back to Common with no percentage when the platform has none', () => {
    const toast = unlockToast(unlock('a', { globalPercent: null }))

    expect(toast.rarity).toBe('common')
    expect(toast.percent).toBeNull()
  })

  it('passes on a missing description as null', () => {
    expect(unlockToast(unlock('a', { description: null, hidden: true })).description).toBeNull()
  })
})

describe('burstToast', () => {
  it('leads with the rarest unlock and counts the rest', () => {
    const toast = burstToast([
      unlock('a', { globalPercent: 40 }),
      unlock('b', { globalPercent: 1.5 }),
      unlock('c', { globalPercent: null }),
    ])

    expect(toast).toMatchObject({
      heading: '3 achievements unlocked',
      title: 'Achievement b',
      description: 'and 2 more',
      rarity: 'ultra_rare',
      percent: 1.5,
      game: 'Half-Life 2',
      platform: 'steam',
    })
  })

  it('names how many games when the burst spans several', () => {
    const toast = burstToast([unlock('a', {}, 'Portal'), unlock('b', {}, 'Portal 2')])

    expect(toast.game).toBe('2 games')
  })

  it('is never a platinum', () => {
    expect(burstToast([unlock('a'), unlock('b')]).platinum).toBe(false)
  })
})

describe('NotificationService', () => {
  it('shows an unlock straight away and removes it after the toast duration', () => {
    service.notify([unlock('a')])
    expect(onScreen()).toEqual(['Achievement a'])

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    expect(onScreen()).toEqual(['Achievement a'])

    vi.advanceTimersByTime(1)
    expect(onScreen()).toEqual([])
  })

  it(`shows at most ${MAX_VISIBLE} at once and brings the next in as one leaves`, () => {
    service.notify([unlock('a'), unlock('b'), unlock('c'), unlock('d')])
    expect(onScreen()).toEqual(['Achievement a', 'Achievement b', 'Achievement c'])

    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(onScreen()).toEqual(['Achievement d'])

    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(onScreen()).toEqual([])
  })

  it('keeps a toast id the same while it stays on screen', () => {
    service.notify([unlock('a')])
    service.notify([unlock('b')])

    const [first, second] = frames
    expect(second?.[0]?.id).toBe(first?.[0]?.id)
    expect(second?.[1]?.id).not.toBe(first?.[0]?.id)
  })

  it('ignores an unlock that is already on screen or waiting', () => {
    service.notify([unlock('a'), unlock('b'), unlock('c'), unlock('d')])
    service.notify([unlock('a'), unlock('d')])

    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(onScreen()).toEqual(['Achievement d'])
    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(onScreen()).toEqual([])
  })

  it(`shows up to ${BURST_SIZE} unlocks from one sync one by one`, () => {
    service.notify(Array.from({ length: BURST_SIZE }, (_, i) => unlock(String(i))))

    expect(onScreen()).toHaveLength(MAX_VISIBLE)
  })

  it(`collapses more than ${BURST_SIZE} unlocks from one sync into one toast`, () => {
    service.notify(Array.from({ length: BURST_SIZE + 1 }, (_, i) => unlock(String(i))))

    expect(frames).toHaveLength(1)
    expect(frames[0]?.[0]?.heading).toBe(`${BURST_SIZE + 1} achievements unlocked`)
  })

  it('keeps a platinum out of a burst and shows it on its own after the others', () => {
    const platinum = { ...unlock('x'), achievement: appPlatinumAchievement('Half-Life 2') }
    service.notify([
      platinum,
      ...Array.from({ length: BURST_SIZE + 1 }, (_, i) => unlock(String(i))),
    ])

    expect(frames.at(-1)?.map((toast) => toast.heading)).toEqual([
      `${BURST_SIZE + 1} achievements unlocked`,
      'Platinum earned',
    ])
  })

  it('shows a platinum after the unlocks that came with it', () => {
    const platinum = { ...unlock('x'), achievement: appPlatinumAchievement('Half-Life 2') }
    service.notify([platinum, unlock('a')])

    expect(onScreen()).toEqual(['Achievement a', 'Platinum'])
  })

  it('queues other toasts, such as the test notification, like any other', () => {
    service.show(SAMPLE)
    service.show(SAMPLE)

    expect(onScreen()).toEqual(['Sample', 'Sample'])
  })

  it('sends nothing when every unlock is a duplicate', () => {
    service.notify([unlock('a')])
    const before = frames.length

    service.notify([unlock('a')])
    service.notify([])

    expect(frames).toHaveLength(before)
  })

  it('stop clears everything, and no timer fires afterwards', () => {
    service.notify([unlock('a'), unlock('b'), unlock('c'), unlock('d')])
    const before = frames.length

    service.stop()
    vi.advanceTimersByTime(TOAST_DURATION_MS * 3)

    expect(frames).toHaveLength(before)
  })

  it('shows no unlocks while paused, but still shows the test notification', () => {
    service.paused = true
    service.notify([unlock('a')])
    expect(frames).toHaveLength(0)

    service.show(SAMPLE)
    expect(onScreen()).toEqual(['Sample'])
  })

  it('shows unlocks again once unpaused', () => {
    service.paused = true
    service.notify([unlock('a')])
    service.paused = false

    service.notify([unlock('b')])

    expect(onScreen()).toEqual(['Achievement b'])
  })
})
