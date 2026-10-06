import { describe, expect, it } from 'vitest'
import {
  describePlaytime,
  formatPlaytime,
  formatUnlockDay,
  formatAgo,
  formatDayHeading,
  formatDayLabel,
  formatPercent,
  formatShare,
  formatTime,
  formatUnlockDate,
  plural,
} from './format'

describe('formatPlaytime', () => {
  it('shows minutes below an hour and whole hours from then on', () => {
    expect(formatPlaytime(0)).toBe('0m')
    expect(formatPlaytime(35 * 60)).toBe('35m')
    expect(formatPlaytime(3599)).toBe('59m')
    expect(formatPlaytime(3600)).toBe('1h')
    expect(formatPlaytime(42 * 3600 + 1800)).toBe('42h')
  })

  it('groups the digits of a large number of hours in the user’s locale', () => {
    expect(formatPlaytime(1203 * 3600)).toBe(`${(1203).toLocaleString()}h`)
  })

  it('adds a plus when the total may be incomplete', () => {
    expect(formatPlaytime(42 * 3600, true)).toBe('42h+')
    expect(formatPlaytime(35 * 60, true)).toBe('35m+')
  })
})

describe('describePlaytime', () => {
  it('spells out hours or minutes, singular and plural', () => {
    expect(describePlaytime(3600)).toBe('1 hour played')
    expect(describePlaytime(42 * 3600)).toBe('42 hours played')
    expect(describePlaytime(60)).toBe('1 minute played')
    expect(describePlaytime(35 * 60)).toBe('35 minutes played')
  })

  it('says when the total may be incomplete', () => {
    expect(describePlaytime(42 * 3600, true)).toBe('42 hours played, may be incomplete')
  })
})

describe('formatPercent', () => {
  it('shows one decimal place, dropping a trailing zero', () => {
    expect(formatPercent(4.25)).toBe('4.3%')
    expect(formatPercent(12)).toBe('12%')
  })

  it('shows two decimal places below 1%', () => {
    expect(formatPercent(0.456)).toBe('0.46%')
  })
})

describe('formatUnlockDay', () => {
  const now = new Date(2026, 8, 23, 18, 0)

  it('says Today or Yesterday, else the date with its year, in the user’s locale', () => {
    const older = new Date(2019, 9, 11, 9, 5)

    expect(formatUnlockDay(new Date(2026, 8, 23, 9, 5), now)).toBe('Today')
    expect(formatUnlockDay(new Date(2026, 8, 22, 23, 59), now)).toBe('Yesterday')
    expect(formatUnlockDay(older, now)).toBe(
      older.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    )
  })
})

describe('formatUnlockDate', () => {
  const now = new Date(2026, 8, 23, 18, 0)

  it('says Today or Yesterday with the time', () => {
    const time = (d: Date) =>
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    const today = new Date(2026, 8, 23, 9, 5)
    const yesterday = new Date(2026, 8, 22, 23, 59)

    expect(formatUnlockDate(today, now)).toBe(`Today, ${time(today)}`)
    expect(formatUnlockDate(yesterday, now)).toBe(`Yesterday, ${time(yesterday)}`)
  })

  it('gives the date for anything older', () => {
    const older = new Date(2026, 2, 9, 12, 0)

    expect(formatUnlockDate(older, now)).toBe(
      older.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    )
  })
})

describe('formatTime', () => {
  it('gives the hours and minutes in the local format', () => {
    const date = new Date(2026, 8, 23, 9, 5)

    expect(formatTime(date)).toBe(
      date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    )
  })
})

describe('formatDayHeading', () => {
  const now = new Date(2026, 8, 23, 18, 0)

  it('says Today and Yesterday by the calendar day, not the last 24 hours', () => {
    expect(formatDayHeading(new Date(2026, 8, 23, 0, 1), now)).toBe('Today')
    expect(formatDayHeading(new Date(2026, 8, 22, 23, 59), now)).toBe('Yesterday')
    expect(formatDayHeading(new Date(2026, 8, 22, 0, 0), now)).toBe('Yesterday')
  })

  it('gives the weekday and full date for anything older', () => {
    const older = new Date(2026, 8, 21, 12, 0)

    expect(formatDayHeading(older, now)).toBe(
      older.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    )
  })
})

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'game')).toBe('1 game')
    expect(plural(0, 'game')).toBe('0 games')
    expect(plural(2, 'achievement')).toBe('2 achievements')
  })
})

describe('formatShare', () => {
  it('shows a share with one decimal place, never rounding up to done', () => {
    expect(formatShare(1284, 2910)).toBe('44.1%')
    expect(formatShare(3482, 5120)).toBe('68.0%')
    expect(formatShare(999, 1000)).toBe('99.9%')
  })

  it('shows 100% when everything is done and 0% when there is nothing', () => {
    expect(formatShare(40, 40)).toBe('100%')
    expect(formatShare(0, 0)).toBe('0%')
  })
})

describe('formatDayLabel', () => {
  const now = new Date(2026, 8, 26, 15, 0)

  it('says Today and Yesterday, then the weekday within the week, then the date', () => {
    expect(formatDayLabel(new Date(2026, 8, 26, 9, 0), now)).toBe('Today')
    expect(formatDayLabel(new Date(2026, 8, 25, 23, 0), now)).toBe('Yesterday')
    expect(formatDayLabel(new Date(2026, 8, 21, 10, 0), now)).toBe(
      new Date(2026, 8, 21).toLocaleDateString(undefined, { weekday: 'short' }),
    )
    expect(formatDayLabel(new Date(2026, 8, 19, 10, 0), now)).toBe(
      new Date(2026, 8, 19).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    )
  })
})

describe('formatAgo', () => {
  const now = new Date(2026, 8, 27, 12, 0, 0)
  const before = (ms: number) => new Date(now.getTime() - ms)

  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [60_000, '1m ago'],
    [59 * 60_000, '59m ago'],
    [60 * 60_000, '1h ago'],
    [23 * 60 * 60_000 + 59 * 60_000, '23h ago'],
    [24 * 60 * 60_000, '1d ago'],
    [3 * 24 * 60 * 60_000, '3d ago'],
  ])('says %i ms ago is "%s"', (elapsed, label) => {
    expect(formatAgo(before(elapsed), now)).toBe(label)
  })

  it('says "just now" for a time a little ahead of the clock', () => {
    expect(formatAgo(before(-5_000), now)).toBe('just now')
  })
})
