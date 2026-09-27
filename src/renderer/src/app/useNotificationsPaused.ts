import { useEffect, useState } from 'react'

export function useNotificationsPaused(): boolean | null {
  const [paused, setPaused] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.getNotificationsPaused().then((value) => {
      if (!cancelled) setPaused(value)
    })
    const stopListening = window.api.onNotificationsPausedChanged(setPaused)

    return () => {
      cancelled = true
      stopListening()
    }
  }, [])

  return paused
}
