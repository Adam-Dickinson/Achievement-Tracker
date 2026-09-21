import { motion, useReducedMotion } from 'motion/react'
import { TrophyIcon } from '@/components/TrophyIcon'
import type { ToastPayload } from '@shared/ipc'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'

/** What the toast draws. How long it stays on screen is the overlay's concern, not the toast's. */
export type ToastProps = Omit<ToastPayload, 'durationMs'>

interface ToastStyle {
  border: string // the icon tile's border, full strength
  cardBorder: string // the card's own border, softer so the glow does the talking
  text: string
  shadow: string
}

// Full class names must appear literally so Tailwind can find them at build time.
const STYLES: Record<Rarity, ToastStyle> = {
  common: {
    border: 'border-rarity-common',
    cardBorder: 'border-rarity-common/45',
    text: 'text-rarity-common',
    shadow: 'shadow-toast-common',
  },
  uncommon: {
    border: 'border-rarity-uncommon',
    cardBorder: 'border-rarity-uncommon/45',
    text: 'text-rarity-uncommon',
    shadow: 'shadow-toast-uncommon',
  },
  rare: {
    border: 'border-rarity-rare',
    cardBorder: 'border-rarity-rare/45',
    text: 'text-rarity-rare',
    shadow: 'shadow-toast-rare',
  },
  ultra_rare: {
    border: 'border-rarity-ultra',
    cardBorder: 'border-rarity-ultra/75',
    text: 'text-rarity-ultra',
    shadow: 'shadow-toast-ultra',
  },
}

const SLIDE_PX = 56

/**
 * The unlock toast. Spec: docs/DESIGN.md §6. Design: the toast draft on the Superdesign canvas
 * (docs/design/README.md); the HTML snapshot in mockups/ is pre-Afterglow.
 * It slides in and out when it is mounted/unmounted inside an <AnimatePresence>.
 */
export function Toast({ rarity, title, description, game, platform, percent }: ToastProps) {
  const style = STYLES[rarity]
  const reduceMotion = useReducedMotion() // honour the OS "reduce motion" setting

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: SLIDE_PX }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: SLIDE_PX }}
      transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
      className={`relative flex h-23 w-100 items-center gap-3 overflow-hidden rounded-panel border bg-surface-1 bg-linear-to-b from-white/6 to-white/1 px-4 ${style.cardBorder} ${style.shadow}`}
    >
      <div
        className={`flex size-16 shrink-0 items-center justify-center rounded-card border-2 bg-surface-3 ${style.border}`}
      >
        <TrophyIcon className={`h-7 w-6 ${style.text}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className={`text-[11px] font-semibold tracking-[0.06em] uppercase ${style.text}`}>
          Achievement unlocked
        </div>
        <div className="truncate text-base font-semibold">{title}</div>
        <div className="truncate text-xs text-fg-muted">{description}</div>
        <div className="truncate text-xs text-fg-subtle">
          {game} · {platform}
        </div>
      </div>

      <div className="text-right">
        <div className={`text-xs font-semibold ${style.text}`}>{RARITY_LABEL[rarity]}</div>
        <div className="text-xs text-fg-muted">{percent}%</div>
      </div>

      {rarity === 'ultra_rare' && !reduceMotion && (
        // A single shimmer sweep across ultra-rare toasts.
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 0.9, delay: 0.35, ease: 'easeInOut' }}
        />
      )}
    </motion.div>
  )
}
