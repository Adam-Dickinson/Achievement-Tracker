import { useEffect, useState } from 'react'
import type { DashboardStats } from '@shared/dashboard'

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    void window.api.getDashboard().then((data) => {
      if (!cancelled) setStats(data)
    })
    return () => {
      cancelled = true
    }
  }, [version])

  useEffect(() => window.api.onDataChanged(() => setVersion((v) => v + 1)), [])

  return stats
}
