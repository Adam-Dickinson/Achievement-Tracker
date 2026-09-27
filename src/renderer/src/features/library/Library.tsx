import { ArrowDownUp, LayoutGrid, List, ListFilter, RectangleVertical } from 'lucide-react'
import { useLayoutEffect, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { GameCard } from '@/components/GameCard'
import { GamePoster } from '@/components/GamePoster'
import { GameRow } from '@/components/GameRow'
import { PlatformBadge } from '@/components/PlatformBadge'
import { setScrollTop, useScrollParent } from '@/components/scroll-parent'
import { Select, type SelectOption } from '@/components/Select'
import { ToggleGroup, type ToggleOption } from '@/components/ToggleGroup'
import { VirtualGrid } from '@/components/VirtualGrid'
import { useDashboardStats } from '@/features/dashboard/useDashboardStats'
import { plural } from '@/lib/format'
import type { LibraryGame } from '@shared/library'
import { platformName } from '@shared/platform'
import {
  applyView,
  clearFilters,
  countMatching,
  isFiltered,
  platformsIn,
  SORTS,
  STATUSES,
  type LayoutId,
  type LibraryView,
  type PlatformFilter,
  type SortId,
  type StatusId,
} from './library-view'
import { LibraryProfile } from './LibraryProfile'
import { useLibrary } from './useLibrary'

interface LibraryProps {
  name: string
  view: LibraryView
  onViewChange: (view: LibraryView) => void
  restoreScrollTop?: number
  onOpenGame: (id: number) => void
}

interface LayoutSpec {
  readonly label: string
  readonly icon: ReactNode
  readonly minColumnWidth: number
  readonly maxColumns?: number
  readonly gap: number
  readonly estimateRowHeight: number
  readonly stagger: boolean
}

const LAYOUTS: Record<LayoutId, LayoutSpec> = {
  landscape: {
    label: 'Landscape',
    icon: <LayoutGrid size={15} />,
    minColumnWidth: 240,
    gap: 24,
    estimateRowHeight: 240,
    stagger: true,
  },
  portrait: {
    label: 'Portrait',
    icon: <RectangleVertical size={15} />,
    minColumnWidth: 180,
    gap: 24,
    estimateRowHeight: 400,
    stagger: true,
  },
  list: {
    label: 'List',
    icon: <List size={15} />,
    minColumnWidth: 1,
    maxColumns: 1,
    gap: 10,
    estimateRowHeight: 78,
    stagger: false,
  },
}

export function Library(props: LibraryProps) {
  return (
    <>
      <h1 className="sr-only">Library</h1>
      <LibraryBody {...props} />
    </>
  )
}

function LibraryBody({ name, view, onViewChange, restoreScrollTop = 0, onOpenGame }: LibraryProps) {
  const games = useLibrary()
  const stats = useDashboardStats()
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
      <p role="status" className="text-fg-muted">
        No games yet. Connect an account on the Accounts screen and its games appear here.
      </p>
    )
  }

  const update = (change: Partial<LibraryView>) => onViewChange({ ...view, ...change })
  const shown = applyView(games, view)
  const layout = LAYOUTS[view.layout]

  return (
    <div className="flex flex-col">
      <LibraryProfile name={name} games={games} stats={stats} />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-surface-1 bg-linear-to-b from-white/5 to-white/1 p-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_14px_30px_-16px_rgb(0_0_0/0.7)]">
        <ToggleGroup
          label="Platform"
          options={platformOptions(games, view)}
          selected={view.platform}
          onSelect={(platform) => update({ platform })}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            label="Progress"
            icon={ListFilter}
            options={statusOptions(games, view)}
            value={view.status}
            onChange={(status) => update({ status })}
          />
          <Select
            label="Sort by"
            icon={ArrowDownUp}
            options={sortOptions()}
            value={view.sort}
            onChange={(sort) => update({ sort })}
          />
          <ToggleGroup
            label="View"
            variant="segmented"
            options={layoutOptions()}
            selected={view.layout}
            onSelect={(next) => update({ layout: next })}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="mt-9 flex flex-col items-center gap-3">
          <p className="text-fg-muted">No games match these filters.</p>
          <Button variant="secondary" onClick={() => onViewChange(clearFilters(view))}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="mt-9">
          <VirtualGrid
            key={view.layout}
            items={shown}
            label="Games"
            minColumnWidth={layout.minColumnWidth}
            maxColumns={layout.maxColumns}
            gap={layout.gap}
            estimateRowHeight={layout.estimateRowHeight}
            getKey={(game) => game.id}
            renderItem={(game, column) => (
              <div className={`w-full ${layout.stagger && column % 2 === 1 ? 'mt-6.5' : ''}`}>
                <GameView layout={view.layout} game={game} onOpen={onOpenGame} />
              </div>
            )}
          />
        </div>
      )}

      <p aria-live="polite" className="mt-14 text-center text-[13px] text-fg-muted">
        {isFiltered(view)
          ? `Showing ${shown.length.toLocaleString()} of ${plural(games.length, 'game')}`
          : `Showing all ${plural(games.length, 'game')}`}
      </p>
    </div>
  )
}

function GameView({
  layout,
  game,
  onOpen,
}: {
  layout: LayoutId
  game: LibraryGame
  onOpen: (id: number) => void
}) {
  switch (layout) {
    case 'landscape':
      return <GameCard game={game} onOpen={onOpen} />
    case 'portrait':
      return <GamePoster game={game} onOpen={onOpen} />
    case 'list':
      return <GameRow game={game} onOpen={onOpen} />
  }
}

function sortOptions(): SelectOption<SortId>[] {
  return (Object.keys(SORTS) as SortId[]).map((id) => ({ id, label: SORTS[id].label }))
}

function layoutOptions(): ToggleOption<LayoutId>[] {
  return (Object.keys(LAYOUTS) as LayoutId[]).map((id) => ({
    id,
    label: LAYOUTS[id].label,
    icon: LAYOUTS[id].icon,
  }))
}

function platformOptions(
  games: readonly LibraryGame[],
  view: LibraryView,
): ToggleOption<PlatformFilter>[] {
  return (['all', ...platformsIn(games)] as PlatformFilter[]).map((platform) => ({
    id: platform,
    label: platform === 'all' ? 'All' : platformName(platform),
    count: countMatching(games, { ...view, platform }),
    icon: platform === 'all' ? undefined : <PlatformBadge platform={platform} size={20} />,
  }))
}

function statusOptions(games: readonly LibraryGame[], view: LibraryView): SelectOption<StatusId>[] {
  return (Object.keys(STATUSES) as StatusId[]).map((status) => ({
    id: status,
    label: `${status === 'all' ? 'All progress' : STATUSES[status].label} (${countMatching(games, { ...view, status }).toLocaleString()})`,
  }))
}
