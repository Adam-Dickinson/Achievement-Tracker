import { AnimatePresence } from 'motion/react'
import { useEffect, useState } from 'react'
import type { VisibleToast } from '@shared/ipc'
import { Toast } from './Toast'

export function OverlayApp() {
  const [toasts, setToasts] = useState<readonly VisibleToast[]>([])

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
