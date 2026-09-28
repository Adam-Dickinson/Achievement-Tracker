import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  TOAST_SCALE,
  type OverlayFrame,
  type ToastCorner,
} from '@shared/ipc'
import { playChime } from './chime'
import { Toast } from './Toast'

const CORNER_ALIGN: Readonly<Record<ToastCorner, string>> = {
  'top-left': 'items-start justify-start',
  'top-right': 'items-end justify-start',
  'bottom-left': 'items-start justify-end',
  'bottom-right': 'items-end justify-end',
}

const INITIAL_FRAME: OverlayFrame = {
  toasts: [],
  corner: DEFAULT_NOTIFICATION_SETTINGS.corner,
  scale: TOAST_SCALE[DEFAULT_NOTIFICATION_SETTINGS.size],
  sound: DEFAULT_NOTIFICATION_SETTINGS.sound,
}

export function OverlayApp() {
  const [frame, setFrame] = useState<OverlayFrame>(INITIAL_FRAME)
  const shownIds = useRef(new Set<number>())

  useEffect(() => window.api.onToasts(setFrame), [])

  useEffect(() => {
    const wasShown = shownIds.current
    shownIds.current = new Set(frame.toasts.map((toast) => toast.id))
    if (!frame.sound.enabled) return
    for (const toast of frame.toasts) {
      if (!wasShown.has(toast.id)) playChime(toast.rarity, frame.sound.volume)
    }
  }, [frame])

  return (
    <div
      className={`flex h-full flex-col gap-3 p-8 ${CORNER_ALIGN[frame.corner]}`}
      style={{
        transform: `scale(${frame.scale})`,
        transformOrigin: frame.corner.replace('-', ' '),
      }}
    >
      <AnimatePresence>
        {frame.toasts.map(({ id, ...toast }) => (
          <Toast key={id} {...toast} />
        ))}
      </AnimatePresence>
    </div>
  )
}
