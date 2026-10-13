import { describe, expect, it, vi } from 'vitest'
import type { OverlayFrame } from '@shared/ipc'
import { eventsUrl, subscribeToStream, type EventSourceLike } from './subscribe'

const FRAME: OverlayFrame = {
  toasts: [],
  corner: 'top-left',
  scale: 1,
  sound: { enabled: true, volume: 0.6 },
}

function fakeSource() {
  const source: EventSourceLike & { send: (data: string) => void } = {
    onmessage: null,
    close: vi.fn(),
    send: (data) => source.onmessage?.(new MessageEvent('message', { data })),
  }
  return source
}

describe('eventsUrl', () => {
  it('uses the server it was served from by default', () => {
    expect(eventsUrl('')).toBe('/events')
  })

  it('uses the events address the dev server was given', () => {
    expect(eventsUrl('?events=http%3A%2F%2F127.0.0.1%3A47821%2Fevents')).toBe(
      'http://127.0.0.1:47821/events',
    )
  })
})

describe('subscribeToStream', () => {
  it('opens the events address and passes each frame on', () => {
    const source = fakeSource()
    const open = vi.fn(() => source)
    const listener = vi.fn()

    subscribeToStream('/events', open)(listener)
    source.send(JSON.stringify(FRAME))

    expect(open).toHaveBeenCalledWith('/events')
    expect(listener).toHaveBeenCalledExactlyOnceWith(FRAME)
  })

  it('skips messages that are not frames', () => {
    const source = fakeSource()
    const listener = vi.fn()

    subscribeToStream('/events', () => source)(listener)
    source.send('not json')
    source.send(JSON.stringify({ toasts: 3 }))

    expect(listener).not.toHaveBeenCalled()
  })

  it('closes the connection when unsubscribed', () => {
    const source = fakeSource()

    const stop = subscribeToStream('/events', () => source)(vi.fn())
    stop()

    expect(source.close).toHaveBeenCalledOnce()
  })
})
