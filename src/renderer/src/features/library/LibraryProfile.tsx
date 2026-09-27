import { CircleCheck, Gamepad2, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from '@/components/Avatar'
import { RarityGem } from '@/components/RarityGem'
import { formatShare, plural } from '@/lib/format'
import { completionPercent, type DashboardStats } from '@shared/dashboard'
import type { LibraryGame } from '@shared/library'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'
import { averageCompletion } from './library-view'

const RARITIES: readonly Rarity[] = ['ultra_rare', 'rare', 'uncommon', 'common']

interface LibraryProfileProps {
  name: string
  games: readonly LibraryGame[]
  stats: DashboardStats | null
}

export function LibraryProfile({ name, games, stats }: LibraryProfileProps) {
  const unlocked = games.reduce((sum, game) => sum + game.unlocked, 0)
  const total = games.reduce((sum, game) => sum + game.total, 0)

  return (
    <section
      aria-label="Your library"
      className="relative overflow-hidden rounded-panel border border-line bg-surface-1 bg-linear-to-b from-white/5 to-white/1 p-7 shadow-float"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-16 h-64 w-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex flex-wrap items-center gap-7">
        <Avatar
          name={name}
          className="size-27 text-5xl shadow-[0_0_0_5px_color-mix(in_srgb,var(--color-primary)_14%,transparent),0_22px_40px_-14px_color-mix(in_srgb,var(--color-primary)_50%,transparent)]"
        />

        <div className="min-w-72 flex-1">
          <p className="text-[13px] font-semibold text-fg-muted">Your library</p>
          <p className="font-display text-[46px] leading-12.5 font-extrabold">
            {name || 'Your games'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip icon={<Trophy className="size-3.75 text-primary" />}>
              {plural(unlocked, 'achievement')}
            </Chip>
            <Chip icon={<Gamepad2 className="size-3.75 text-primary" />}>
              {plural(games.length, 'game')}
            </Chip>
            <Chip icon={<CircleCheck className="size-3.75 text-primary" />}>
              {averageCompletion(games)}% avg. completion
            </Chip>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Achievements unlocked"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completionPercent(unlocked, total)}
              className="h-4 w-full max-w-105 overflow-hidden rounded-full bg-white/9"
            >
              <div
                className="h-full rounded-full bg-linear-to-r from-primary/75 to-primary shadow-glow-primary"
                style={{ width: `${completionPercent(unlocked, total)}%` }}
              />
            </div>
            <span className="text-[13px] whitespace-nowrap text-fg-muted">
              <b className="text-fg">{formatShare(unlocked, total)}</b> of {total.toLocaleString()}
            </span>
          </div>
        </div>

        <ul aria-label="Unlocked by rarity" className="grid shrink-0 grid-cols-4 gap-3">
          {RARITIES.map((rarity) => (
            <li
              key={rarity}
              data-rarity={rarity}
              className="w-28 rounded-[20px] border border-white/7 bg-white/4 px-3.5 py-3"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-(--rarity)">
                <RarityGem rarity={rarity} className="size-3" />
                {RARITY_LABEL[rarity]}
              </span>
              <span className="mt-1 block font-display text-[30px] leading-8 font-extrabold">
                {stats ? stats.unlockedByRarity[rarity].toLocaleString() : '–'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex h-7.5 items-center gap-1.5 rounded-full border border-white/8 bg-white/6 px-3.25 text-[13px] font-semibold whitespace-nowrap">
      <span aria-hidden="true" className="flex">
        {icon}
      </span>
      {children}
    </span>
  )
}
