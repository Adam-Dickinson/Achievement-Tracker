import { useEffect, useState } from 'react'
import type { LibraryGame } from '@shared/library'

export function useLibrary() {
  // null until the main process replies.
  const [games, setGames] = useState<LibraryGame[] | null>(null)
  // Bumped when the main process says synced data changed, which re-runs the fetch below.
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
