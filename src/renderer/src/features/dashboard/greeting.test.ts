import { describe, expect, it } from 'vitest'
import { greeting } from './greeting'

describe('greeting', () => {
  it.each([
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
    [2, 'Good evening'],
  ])('at %i:00 says %s', (hour, text) => {
    expect(greeting(new Date(2026, 8, 26, hour, 30))).toBe(text)
  })
})
