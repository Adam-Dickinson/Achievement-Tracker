import type { LibraryGame } from '@shared/library'
import { CoverArt } from './CoverArt'
import { cardShell, GameCardFooter, PercentPill } from './GameCardParts'
import { gameProgress } from './game-progress'

interface GameCardProps {
  game: LibraryGame
  onOpen: (id: number) => void
}

export function GameCard({ game, onOpen }: GameCardProps) {
  const progress = gameProgress(game)

  return (
    <button type="button" onClick={() => onOpen(game.id)} className={cardShell(progress)}>
      <div className="relative aspect-460/215 overflow-hidden rounded-[18px] bg-surface-3">
        <CoverArt url={game.coverUrl} title={game.title} percent={progress.percent} />
        <PercentPill progress={progress} />
      </div>
      <GameCardFooter game={game} progress={progress} />
    </button>
  )
}
