import { useEffect, useState } from 'react'
import type { LibraryGame } from '@shared/library'

export function useLibrary() {
  const [games, setGames] = useState<LibraryGame[] | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    void window.api.listLibrary().then((data) => {
      if (!cancelled) setGames(data)
    })
    return () => {
      cancelled = true
    }
  }, [version])

  useEffect(() => window.api.onDataChanged(() => setVersion((v) => v + 1)), [])

  return games
}
