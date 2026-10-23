import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUIET_HOURS,
  isQuietTime,
  minutesToTime,
  timeToMinutes,
  type QuietHours,
} from './quiet-hours'

const at = (hours: number, minutes = 0): Date => new Date(2026, 9, 23, hours, minutes)

describe('isQuietTime', () => {
  const overnight: QuietHours = { enabled: true, start: 22 * 60, end: 7 * 60 }
  const daytime: QuietHours = { enabled: true, start: 9 * 60, end: 17 * 60 + 30 }

  it.each([
    [22, 0, true],
    [23, 59, true],
    [0, 0, true],
    [6, 59, true],
    [7, 0, false],
    [12, 0, false],
    [21, 59, false],
  ])('across midnight, %i:%i is quiet: %s', (hours, minutes, quiet) => {
    expect(isQuietTime(overnight, at(hours, minutes))).toBe(quiet)
  })

  it.each([
    [9, 0, true],
    [17, 29, true],
    [17, 30, false],
    [8, 59, false],
    [23, 0, false],
  ])('within one day, %i:%i is quiet: %s', (hours, minutes, quiet) => {
    expect(isQuietTime(daytime, at(hours, minutes))).toBe(quiet)
  })

  it('is never quiet when turned off', () => {
    expect(isQuietTime({ ...overnight, enabled: false }, at(23))).toBe(false)
  })

  it('is never quiet when the start and end are the same', () => {
    expect(isQuietTime({ enabled: true, start: 600, end: 600 }, at(10))).toBe(false)
  })

  it('is off by default, from 22:00 to 07:00', () => {
    expect(DEFAULT_QUIET_HOURS).toEqual({ enabled: false, start: 1320, end: 420 })
  })
})

describe('timeToMinutes', () => {
  it.each([
    ['00:00', 0],
    ['07:05', 425],
    ['22:00', 1320],
    ['23:59', 1439],
  ])('reads %s', (time, minutes) => {
    expect(timeToMinutes(time)).toBe(minutes)
  })

  it.each(['', '7:00', '24:00', '12:60', '12:00:00', 'noon'])('refuses %j', (time) => {
    expect(timeToMinutes(time)).toBeNull()
  })
})

describe('minutesToTime', () => {
  it.each([
    [0, '00:00'],
    [425, '07:05'],
    [1439, '23:59'],
  ])('writes %i as %s', (minutes, time) => {
    expect(minutesToTime(minutes)).toBe(time)
  })
})
