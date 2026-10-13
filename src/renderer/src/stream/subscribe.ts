import type { OverlayFrame } from '@shared/ipc'
import { parseOverlayFrame } from '@shared/stream-overlay'

export interface EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null
  close(): void
}

export function eventsUrl(search: string): string {
  return new URLSearchParams(search).get('events') ?? '/events'
}

export function subscribeToStream(
  url: string,
  open: (url: string) => EventSourceLike = (target) => new EventSource(target),
) {
  return (listener: (frame: OverlayFrame) => void): (() => void) => {
    const source = open(url)
    source.onmessage = (event) => {
      const frame = parseOverlayFrame(event.data)
      if (frame) listener(frame)
    }
    return () => source.close()
  }
}
