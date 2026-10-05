import { Play } from 'lucide-react'
import { useState } from 'react'
import type { InstalledEntry } from '@shared/launch'
import { playLabel } from '../launch/launch-labels'
import { GLASS_BUTTON } from './GameBanner'

interface PlayButtonsProps {
  installed: readonly InstalledEntry[] | null
  entryIds: readonly number[]
}

export function PlayButtons({ installed, entryIds }: PlayButtonsProps) {
  const [starting, setStarting] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const options = (installed ?? []).filter((item) => entryIds.includes(item.platformGameId))
  if (options.length === 0) return null

  async function play(platformGameId: number) {
    setProblem(null)
    setStarting(platformGameId)
    try {
      const result = await window.api.playGame(platformGameId)
      if (!result.ok) setProblem(result.reason)
    } catch {
      setProblem('Something went wrong while starting the game. Try again.')
    } finally {
      setStarting(null)
    }
  }

  return (
    <>
      {options.map((item) => (
        <button
          key={item.platformGameId}
          type="button"
          disabled={starting !== null}
          onClick={() => void play(item.platformGameId)}
          className={GLASS_BUTTON}
        >
          <Play aria-hidden="true" className="size-3.5" />
          {starting === item.platformGameId
            ? 'Starting…'
            : playLabel(item.platform, options.length)}
        </button>
      ))}
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
    </>
  )
}
