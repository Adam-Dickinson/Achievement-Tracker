import type { LibraryGame } from '@shared/library'
import { CoverArt, paletteFor } from './CoverArt'
import { cardShell, GameCardFooter, PercentPill } from './GameCardParts'
import { gameProgress } from './game-progress'

interface GamePosterProps {
  game: LibraryGame
  onOpen: (id: number) => void
}

export function GamePoster({ game, onOpen }: GamePosterProps) {
  const progress = gameProgress(game)

  return (
    <button type="button" onClick={() => onOpen(game.id)} className={cardShell(progress)}>
      <div className="relative aspect-2/3 overflow-hidden rounded-[18px] bg-surface-3">
        {game.portraitUrl ? (
          <CoverArt url={game.portraitUrl} title={game.title} percent={progress.percent} />
        ) : (
          <FramedCover game={game} percent={progress.percent} />
        )}
        <PercentPill progress={progress} />
      </div>
      <GameCardFooter game={game} progress={progress} />
    </button>
  )
}

function FramedCover({ game, percent }: { game: LibraryGame; percent: number }) {
  return (
    <>
      {game.coverUrl ? (
        <img
          src={game.coverUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full scale-125 object-cover opacity-45 blur-xl grayscale-50"
        />
      ) : (
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-linear-140 opacity-45 ${paletteFor(game.title)}`}
        />
      )}
      <div className="absolute inset-x-0 top-1/2 aspect-460/215 -translate-y-1/2 overflow-hidden shadow-float">
        <CoverArt url={game.coverUrl} title={game.title} percent={percent} />
      </div>
    </>
  )
}
