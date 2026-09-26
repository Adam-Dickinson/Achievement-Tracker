import { useCallback, useEffect, useState } from 'react'
import type { GameDetail } from '@shared/library'

export function useGame(id: number) {
  const [detail, setDetail] = useState<GameDetail | null | undefined>(undefined)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    void window.api.getGame(id).then((data) => {
      if (!cancelled) setDetail(data)
    })
    return () => {
      cancelled = true
    }
  }, [id, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => window.api.onDataChanged(reload), [reload])

  return { detail, reload }
}
