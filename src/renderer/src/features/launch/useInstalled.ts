import { useEffect, useState } from 'react'
import type { InstalledEntry } from '@shared/launch'

export function useInstalled() {
  const [installed, setInstalled] = useState<InstalledEntry[] | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    window.api.getInstalled().then(
      (data) => {
        if (!cancelled) setInstalled(data)
      },
      () => {
        if (!cancelled) setInstalled([])
      },
    )
    return () => {
      cancelled = true
    }
  }, [version])

  useEffect(() => {
    const reload = () => setVersion((v) => v + 1)
    const offInstalled = window.api.onInstalledChanged(reload)
    const offData = window.api.onDataChanged(reload)
    return () => {
      offInstalled()
      offData()
    }
  }, [])

  return installed
}
