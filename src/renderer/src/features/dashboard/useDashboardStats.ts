import { useState, useEffect } from 'react'
import { SAMPLE_STATS } from './sample-stats'

function fetchStats() {
  return Promise.resolve(SAMPLE_STATS)
}

export function useDashboardStats() {
  const [stats, setStats] = useState<typeof SAMPLE_STATS | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchStats().then((data) => {
      if (!cancelled) {
        setStats(data)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return stats
}
