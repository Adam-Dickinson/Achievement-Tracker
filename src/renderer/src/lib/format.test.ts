import { describe, expect, it } from 'vitest'
import { formatDayHeading, formatPercent, formatTime, formatUnlockDate, plural } from './format'

describe('formatPercent', () => {
  it('shows one decimal place, dropping a trailing zero', () => {
    expect(formatPercent(4.25)).toBe('4.3%')
    expect(formatPercent(12)).toBe('12%')
  })

  it('shows two decimal places below 1%', () => {
    expect(formatPercent(0.456)).toBe('0.46%')
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
