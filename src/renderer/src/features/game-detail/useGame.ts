import { useEffect, useState } from 'react'
import type { GameDetail } from '@shared/library'

export function useGame(id: number) {
  const [game, setGame] = useState<GameDetail | null | undefined>(undefined)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    void window.api.getGame(id).then((data) => {
      if (!cancelled) setGame(data)
    })
    return () => {
      cancelled = true
    }
  }, [id, version])

  useEffect(() => window.api.onDataChanged(() => setVersion((v) => v + 1)), [])

  return game
}
