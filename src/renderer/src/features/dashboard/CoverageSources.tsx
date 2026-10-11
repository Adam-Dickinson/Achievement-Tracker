import { PlatformBadge } from '@/components/PlatformBadge'
import type { CoverageSource, CoveredGame } from '@shared/dashboard'
import { platformName, type Platform } from '@shared/platform'

interface CoverageSourcesProps {
  id: string
  platform: Platform
  sources: readonly CoverageSource[]
  onOpenGame: (id: number, platformGameId?: number) => void
}

export function CoverageSources({ id, platform, sources, onOpenGame }: CoverageSourcesProps) {
  return (
    <div id={id} className="mt-3 flex flex-col gap-4 rounded-control bg-surface-2/60 p-3">
      {sources.map((source) => {
        const from = platformName(source.platform)
        return (
          <section key={source.platform} aria-label={`From ${from}`}>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
              <PlatformBadge platform={source.platform} size={18} />
              From {from}
              <span className="text-aurora-teal">+{source.covered.toLocaleString()}</span>
            </h3>
            <ul className="mt-1.5 flex flex-col">
              {source.games.map((game) => (
                <li key={game.platformGameId}>
                  <CoveredGameButton
                    game={game}
                    here={platformName(platform)}
                    from={from}
                    onOpen={() => onOpenGame(game.gameId, game.platformGameId)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

interface CoveredGameButtonProps {
  game: CoveredGame
  here: string
  from: string
  onOpen: () => void
}

function CoveredGameButton({ game, here, from, onOpen }: CoveredGameButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-baseline justify-between gap-3 rounded-control px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="truncate">{game.title}</span>
      <span className="shrink-0 text-xs text-fg-muted">
        <span className="font-semibold text-aurora-teal">+{game.covered.toLocaleString()}</span> (
        {here} {game.unlocked}/{game.total}, {from} {game.sourceUnlocked}/{game.sourceTotal})
      </span>
    </button>
  )
}
