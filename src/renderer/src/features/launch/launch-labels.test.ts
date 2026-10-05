import { describe, expect, it } from 'vitest'
import { playLabel } from './launch-labels'

describe('playLabel', () => {
  it('is just Play when there is one install', () => {
    expect(playLabel('steam', 1)).toBe('Play')
  })

  it('names the platform when there are several installs', () => {
    expect(playLabel('epic', 2)).toBe('Play on Epic Games')
  })
})
