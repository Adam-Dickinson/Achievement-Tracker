import { describe, expect, it } from 'vitest'
import type { OverlayFrame } from './ipc'
import { parseOverlayFrame } from './stream-overlay'

const frame: OverlayFrame = {
  toasts: [
    {
      id: 1,
      heading: 'Achievement unlocked',
      rarity: 'rare',
      title: 'Raid Ready',
      description: 'Finish the raid',
      game: 'Destiny 2',
      platform: 'steam',
      percent: 4.2,
      platinum: false,
    },
  ],
  corner: 'top-left',
  scale: 1,
  sound: { enabled: true, volume: 0.6 },
}

describe('parseOverlayFrame', () => {
  it('reads a frame sent by the stream overlay server', () => {
    expect(parseOverlayFrame(JSON.stringify(frame))).toEqual(frame)
  })

  it('reads an empty frame', () => {
    expect(parseOverlayFrame(JSON.stringify({ ...frame, toasts: [] }))?.toasts).toEqual([])
  })

  it('accepts toasts without a platform, description or percent', () => {
    const toast = { ...frame.toasts[0], platform: null, description: null, percent: null }
    expect(parseOverlayFrame(JSON.stringify({ ...frame, toasts: [toast] }))?.toasts).toEqual([
      toast,
    ])
  })

  it('ignores text that is not JSON', () => {
    expect(parseOverlayFrame('not json')).toBeNull()
  })

  it('ignores frames with the wrong shape', () => {
    expect(parseOverlayFrame(JSON.stringify({ toasts: 'nope' }))).toBeNull()
    expect(parseOverlayFrame(JSON.stringify({ ...frame, corner: 'middle' }))).toBeNull()
    expect(
      parseOverlayFrame(
        JSON.stringify({ ...frame, toasts: [{ ...frame.toasts[0], rarity: 'x' }] }),
      ),
    ).toBeNull()
  })
})
