import { Crown } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { PlatinumChip } from '@/components/PlatinumChip'
import { RarityChip } from '@/components/RarityChip'
import { RarityGem } from '@/components/RarityGem'
import { TrophyIcon } from '@/components/TrophyIcon'
import type { ToastPayload } from '@shared/ipc'

export type ToastProps = ToastPayload

const SLIDE_PX = 56

const ENTER = {
  x: { type: 'spring', stiffness: 420, damping: 32 },
  opacity: { duration: 0.15 },
} as const
const EXIT = { duration: 0.2, ease: 'easeIn' } as const

export function Toast({
  heading,
  rarity,
  title,
  description,
  game,
  platform,
  percent,
  platinum,
}: ToastProps) {
  const reduceMotion = useReducedMotion()
  const isUltra = rarity === 'ultra_rare' || platinum

  return (
    <motion.div
      data-rarity={rarity}
      data-platinum={platinum ? '' : undefined}
      role="status"
      aria-live="polite"
      layout="position"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: SLIDE_PX }}
      animate={{ opacity: 1, x: 0, transition: ENTER }}
      exit={
        reduceMotion
          ? { opacity: 0, transition: EXIT }
          : { opacity: 0, x: SLIDE_PX, transition: EXIT }
      }
      className={`relative flex h-23 w-100 items-center gap-3 overflow-hidden rounded-panel border bg-surface-1 bg-linear-to-b from-white/6 to-white/1 px-4 shadow-toast ${isUltra ? 'border-(--rarity)/75' : 'border-(--rarity)/45'}`}
    >
      <div className="flex size-15 shrink-0 items-center justify-center rounded-card bg-linear-140 from-(--rarity-light) to-(--rarity-dark) text-(--rarity-on) shadow-tile">
        <TrophyIcon className="h-7 w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-(--rarity) uppercase">
          {platinum ? (
            <Crown aria-hidden="true" className="size-3" />
          ) : (
            <RarityGem rarity={rarity} className="size-3" />
          )}
          {heading}
        </div>
        <div className="font-display truncate text-lg leading-6 font-bold">{title}</div>
        {description && <div className="truncate text-xs text-fg-muted">{description}</div>}
        <div className="mt-0.5 truncate text-[11px] text-fg-subtle">
          {game} · {platform}
        </div>
      </div>

      <div className="flex min-w-19 shrink-0 flex-col items-end gap-1">
        {percent !== null && (
          <span
            className={`font-display text-[28px] leading-7 font-extrabold ${isUltra ? 'text-(--rarity)' : 'text-fg'}`}
          >
            {percent}%
          </span>
        )}
        {platinum ? <PlatinumChip /> : <RarityChip rarity={rarity} />}
      </div>

      {isUltra && !reduceMotion && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-15 bg-linear-to-r from-transparent via-(--rarity-light)/30 to-transparent"
          initial={{ x: -80, skewX: -18 }}
          animate={{ x: 440, skewX: -18 }}
          transition={{ duration: 0.9, delay: 0.35, ease: 'easeInOut' }}
        />
      )}
    </motion.div>
  )
}
