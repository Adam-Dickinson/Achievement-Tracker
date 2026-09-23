import { AnimatePresence } from 'motion/react'
import { useEffect, useState } from 'react'
import type { VisibleToast } from '@shared/ipc'
import { Toast } from './Toast'

/**
 * Root of the overlay window: draws the toasts the main process says are on screen, newest at
 * the bottom. The main process decides when each appears and leaves (notifications.ts).
 */
export function OverlayApp() {
  const [toasts, setToasts] = useState<readonly VisibleToast[]>([])

  // onToasts returns its unsubscribe function, which React calls as the cleanup on unmount.
  useEffect(() => window.api.onToasts(setToasts), [])

  return (
    <div className="flex h-full flex-col items-end justify-end gap-3 px-10 pt-8 pb-16">
      <AnimatePresence>
        {toasts.map(({ id, ...toast }) => (
          <Toast key={id} {...toast} />
        ))}
      </AnimatePresence>
    </div>
  )
}
