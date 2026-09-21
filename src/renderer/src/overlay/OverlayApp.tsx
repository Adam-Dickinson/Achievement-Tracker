import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { ToastPayload } from '@shared/ipc'
import { Toast } from './Toast'

interface ActiveToast {
  id: number // a new id per toast makes React treat it as a different element, so it animates in
  payload: ToastPayload
}

/**
 * Root of the overlay window: shows the most recent toast for `durationMs`, then removes it.
 * M1 adds a queue and stacking for bursts of unlocks (docs/DESIGN.md §6).
 */
export function OverlayApp() {
  const [toast, setToast] = useState<ActiveToast | null>(null)
  const nextId = useRef(0) // a ref holds a value that survives re-renders without causing one

  // Subscribe to toasts from the main process. The function returned here is the cleanup:
  // React calls it when the component unmounts, which unsubscribes.
  useEffect(() => {
    return window.api.onToast((payload) => {
      nextId.current += 1
      setToast({ id: nextId.current, payload })
    })
  }, [])

  // Each time a new toast arrives, start a timer to dismiss it. Returning clearTimeout cancels
  // the old timer if another toast replaces this one first.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.payload.durationMs)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <div className="flex h-full items-end justify-end px-10 pt-8 pb-16">
      <AnimatePresence>{toast && <Toast key={toast.id} {...toast.payload} />}</AnimatePresence>
    </div>
  )
}
