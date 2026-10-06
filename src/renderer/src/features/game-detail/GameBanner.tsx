import type { ReactNode } from 'react'
import { paletteFor } from '@/components/CoverArt'
import { PlatformBadge } from '@/components/PlatformBadge'
import { PlaytimeLabel } from '@/components/PlaytimeLabel'
import type { LibraryGame } from '@shared/library'
import { platformName } from '@shared/platform'

export const GLASS_BUTTON =
  'flex h-10 shrink-0 items-center gap-2 rounded-full bg-canvas/40 px-4 text-[13px] font-semibold whitespace-nowrap backdrop-blur transition-colors hover:bg-canvas/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-60'

interface GameBannerProps {
  game: LibraryGame
  back: ReactNode
  actions: ReactNode
}

export function GameBanner({ game, back, actions }: GameBannerProps) {
  const art = game.heroUrl ?? game.coverUrl

  return (
    <section
      aria-labelledby="game-title"
      className="relative h-95 overflow-hidden rounded-panel border border-line bg-surface-1 shadow-float"
    >
      {art ? (
        <img src={art} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-linear-140 ${paletteFor(game.title)}`}
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-r from-canvas/92 via-canvas/55 via-46% to-transparent to-78%"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-canvas/85 to-transparent to-45%"
      />

      <div className="relative flex h-full flex-col justify-between px-9 pt-9 pb-19">
        <div className="flex items-center justify-between gap-3">
          {back}
          <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
        <div>
          <p className="flex items-center gap-2">
            <span className="flex gap-1.5">
              {game.platforms.map((platform) => (
                <PlatformBadge key={platform} platform={platform} size={28} />
              ))}
            </span>
            <span className="ml-1 text-[13px] font-semibold text-fg/70">
              {game.platforms.map(platformName).join(' · ')}
            </span>
            <PlaytimeLabel
              seconds={game.playtimeSeconds}
              partial={game.playtimePartial}
              className="ml-2 text-[13px] font-semibold text-fg/70"
            />
          </p>
          <h1
            id="game-title"
            className="mt-3 line-clamp-2 font-display text-[clamp(44px,6vw,92px)] leading-[0.96] font-extrabold"
          >
            {game.title}
          </h1>
        </div>
      </div>
    </section>
  )
}
