import { useLayoutEffect } from 'react'
import { Button } from '@/components/Button'
import { GameCard } from '@/components/GameCard'
import { SearchBox } from '@/components/SearchBox'
import { setScrollTop, useScrollParent } from '@/components/scroll-parent'
import { ToggleGroup, type ToggleOption } from '@/components/ToggleGroup'
import { VirtualGrid } from '@/components/VirtualGrid'
import { plural } from '@/lib/format'
import type { LibraryGame } from '@shared/library'
import { platformName } from '@shared/platform'
import {
  applyView,
  countMatching,
  DEFAULT_VIEW,
  isFiltered,
  platformsIn,
  SORTS,
  STATUSES,
  type LibraryView,
  type PlatformFilter,
  type SortId,
  type StatusId,
} from './library-view'
import { useLibrary } from './useLibrary'

interface LibraryProps {
  view: LibraryView
  onViewChange: (view: LibraryView) => void
  restoreScrollTop?: number
  onOpenGame: (id: number) => void
}

export function Library({ view, onViewChange, restoreScrollTop = 0, onOpenGame }: LibraryProps) {
  const games = useLibrary()
  const scrollParent = useScrollParent()
  const loaded = games !== null

  useLayoutEffect(() => {
    if (loaded && scrollParent && restoreScrollTop > 0) setScrollTop(scrollParent, restoreScrollTop)
  }, [loaded, scrollParent, restoreScrollTop])

  if (!games) {
    return <p role="status">Loading...</p>
  }

  if (games.length === 0) {
    return (
      <p role="status" className="mt-8 text-fg-muted">
        No games yet. Connect an account on the Accounts screen and its games appear here.
      </p>
    )
  }

  const update = (change: Partial<LibraryView>) => onViewChange({ ...view, ...change })
  const shown = applyView(games, view)

  return (
    <div className="mt-8 flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <SearchBox
          label="Search games"
          placeholder="Search games"
          value={view.query}
          onChange={(query) => update({ query })}
        />
        <ToggleGroup
          label="Sort by"
          variant="segmented"
          options={sortOptions()}
          selected={view.sort}
          onSelect={(sort) => update({ sort })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <ToggleGroup
          label="Platform"
          options={platformOptions(games, view)}
          selected={view.platform}
          onSelect={(platform) => update({ platform })}
        />
        <ToggleGroup
          label="Progress"
          options={statusOptions(games, view)}
          selected={view.status}
          onSelect={(status) => update({ status })}
        />
      </div>

      <p aria-live="polite" className="text-sm text-fg-muted">
        {isFiltered(view)
          ? `Showing ${shown.length.toLocaleString()} of ${plural(games.length, 'game')}`
          : plural(games.length, 'game')}
      </p>

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-fg-muted">No games match these filters.</p>
          <Button
            variant="secondary"
            onClick={() => onViewChange({ ...DEFAULT_VIEW, sort: view.sort })}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <VirtualGrid
          items={shown}
          label="Games"
          minColumnWidth={240}
          gap={20}
          estimateRowHeight={260}
          getKey={(game) => game.id}
          renderItem={(game) => <GameCard game={game} onOpen={onOpenGame} />}
        />
      )}
    </div>
  )
}

function sortOptions(): ToggleOption<SortId>[] {
  return (Object.keys(SORTS) as SortId[]).map((id) => ({ id, label: SORTS[id].label }))
}

function platformOptions(
  games: readonly LibraryGame[],
  view: LibraryView,
): ToggleOption<PlatformFilter>[] {
  return (['all', ...platformsIn(games)] as PlatformFilter[]).map((platform) => ({
    id: platform,
    label: platform === 'all' ? 'All' : platformName(platform),
    count: countMatching(games, { ...view, platform }),
  }))
}

function statusOptions(games: readonly LibraryGame[], view: LibraryView): ToggleOption<StatusId>[] {
  return (Object.keys(STATUSES) as StatusId[]).map((status) => ({
    id: status,
    label: STATUSES[status].label,
    count: countMatching(games, { ...view, status }),
  }))
}
