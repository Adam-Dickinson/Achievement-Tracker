import { ArrowDownUp, ArrowLeft, ExternalLink, Link2, RefreshCw, Unlink } from 'lucide-react'
import { useState } from 'react'
import { SearchBox } from '@/components/SearchBox'
import { Select } from '@/components/Select'
import { ToggleGroup } from '@/components/ToggleGroup'
import { VirtualGrid } from '@/components/VirtualGrid'
import { useInstalled } from '@/features/launch/useInstalled'
import { type Platform, platformName } from '@shared/platform'
import { AchievementRow } from './AchievementRow'
import {
  ACHIEVEMENT_SORTS,
  applyAchievementView,
  countAchievements,
  DEFAULT_ACHIEVEMENT_VIEW,
  FILTERS,
  type AchievementSortId,
  type AchievementView,
  type FilterId,
} from './achievement-view'
import { entryLabel } from './entry-label'
import { EntryTabs } from './EntryTabs'
import { GameBanner, GLASS_BUTTON } from './GameBanner'
import { GameStats } from './GameStats'
import { LinkGame } from './LinkGame'
import { PlatinumBanner } from './PlatinumBanner'
import { PlayButtons } from './PlayButtons'
import { useGame } from './useGame'

export function storeLabel(platform: Platform): string {
  return platform === 'xbox' ? 'View on Xbox.com' : `Open in ${platformName(platform)}`
}

interface GameDetailProps {
  id: number
  initialEntry?: number
  onBack: () => void
}

export function GameDetail({ id, initialEntry, onBack }: GameDetailProps) {
  const { detail, reload } = useGame(id)
  const installed = useInstalled()
  const [view, setView] = useState<AchievementView>(DEFAULT_ACHIEVEMENT_VIEW)
  const [selected, setSelected] = useState(initialEntry)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  async function change(run: () => Promise<void>) {
    setError(null)
    try {
      await run()
      reload()
    } catch {
      setError('Something went wrong while changing the link. Try again.')
    }
  }

  async function syncThisGame() {
    setError(null)
    setSyncing(true)
    try {
      await window.api.syncNow({ kind: 'game', gameId: id })
      reload()
    } catch {
      setError('Something went wrong while syncing. Try again.')
    } finally {
      setSyncing(false)
    }
  }

  const back = (
    <button type="button" onClick={onBack} className={`${GLASS_BUTTON} self-start`}>
      <ArrowLeft aria-hidden="true" className="size-4" />
      Library
    </button>
  )

  if (detail === undefined) return <p role="status">Loading...</p>
  const entry = detail?.entries.find((e) => e.platformGameId === selected) ?? detail?.entries[0]
  if (!detail || !entry) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p role="status" className="text-fg-muted">
          This game is no longer in your library.
        </p>
      </div>
    )
  }

  const { game, entries } = detail
  const { achievements } = entry

  const link = (otherGameId: number) =>
    change(async () => {
      await window.api.mergeGames({ intoGameId: game.id, gameId: otherGameId })
      setLinking(false)
    })
  const unlink = () =>
    change(async () => {
      await window.api.unlinkGame({ platformGameId: entry.platformGameId })
      setSelected(undefined)
    })
  const shown = applyAchievementView(achievements, view)
  const update = (change: Partial<AchievementView>) => setView({ ...view, ...change })

  const actions = (
    <>
      <PlayButtons installed={installed} entryIds={entries.map((e) => e.platformGameId)} />
      <button
        type="button"
        disabled={syncing}
        onClick={() => void syncThisGame()}
        className={GLASS_BUTTON}
      >
        <RefreshCw
          aria-hidden="true"
          className={`size-3.5 ${syncing ? 'motion-safe:animate-spin' : ''}`}
        />
        {syncing ? 'Syncing…' : 'Sync this game'}
      </button>
      <button
        type="button"
        aria-expanded={linking}
        onClick={() => setLinking((open) => !open)}
        className={GLASS_BUTTON}
      >
        <Link2 aria-hidden="true" className="size-3.5" />
        Link another game…
      </button>
      {entries.length > 1 && (
        <button type="button" onClick={() => void unlink()} className={GLASS_BUTTON}>
          <Unlink aria-hidden="true" className="size-3.5" />
          Unlink {entryLabel(entry)}
        </button>
      )}
      {entry.hasStorePage && (
        <button
          type="button"
          onClick={() => void window.api.openStorePage(entry.platformGameId)}
          className={GLASS_BUTTON}
        >
          {storeLabel(entry.platform)}
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </>
  )

  return (
    <div className="flex flex-col">
      <GameBanner game={game} back={back} actions={actions} />
      <GameStats entry={entry} />

      {error && (
        <p role="alert" className="mt-5 text-sm text-danger">
          {error}
        </p>
      )}

      {linking && (
        <div className="mt-6">
          <LinkGame
            gameId={game.id}
            onPick={(otherGameId) => void link(otherGameId)}
            onClose={() => setLinking(false)}
          />
        </div>
      )}

      <div className="mt-9 flex flex-wrap items-center justify-between gap-4">
        {entries.length > 1 ? (
          <EntryTabs entries={entries} selected={entry.platformGameId} onSelect={setSelected} />
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            label="Show"
            options={(Object.keys(FILTERS) as FilterId[]).map((filter) => ({
              id: filter,
              label: FILTERS[filter].label,
              count: countAchievements(achievements, { ...view, filter }),
            }))}
            selected={view.filter}
            onSelect={(filter) => update({ filter })}
          />
          <div className="w-60">
            <SearchBox
              label="Search achievements"
              placeholder="Search achievements"
              value={view.query}
              onChange={(query) => update({ query })}
            />
          </div>
          <Select
            label="Sort by"
            icon={ArrowDownUp}
            options={(Object.keys(ACHIEVEMENT_SORTS) as AchievementSortId[]).map((sort) => ({
              id: sort,
              label: ACHIEVEMENT_SORTS[sort].label,
            }))}
            value={view.sort}
            onChange={(sort) => update({ sort })}
          />
        </div>
      </div>

      <div
        id="entry-panel"
        role={entries.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={entries.length > 1 ? `entry-tab-${entry.platformGameId}` : undefined}
        className="mt-6 flex flex-col gap-6"
      >
        <PlatinumBanner entry={entry} />

        {achievements.length === 0 ? (
          <p role="status" className="text-fg-muted">
            This game&apos;s achievements haven&apos;t been read yet. They appear after its first
            sync.
          </p>
        ) : shown.length === 0 ? (
          <p role="status" className="text-fg-muted">
            {view.query.trim() === ''
              ? 'No achievements to show here.'
              : `No achievements match “${view.query.trim()}”.`}
          </p>
        ) : (
          <VirtualGrid
            items={shown}
            label="Achievements"
            minColumnWidth={360}
            maxColumns={2}
            gap={16}
            estimateRowHeight={96}
            getKey={(achievement) => achievement.id}
            renderItem={(achievement) => <AchievementRow achievement={achievement} />}
          />
        )}
      </div>
    </div>
  )
}
