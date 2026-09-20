import { motion, useReducedMotion } from 'motion/react'
import { TrophyIcon } from '@/components/TrophyIcon'
import type { ToastPayload } from '@shared/ipc'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'

/** What the toast draws. How long it stays on screen is the overlay's concern, not the toast's. */
export type ToastProps = Omit<ToastPayload, 'durationMs'>

// Full class names must appear literally so Tailwind can find them at build time.
const STYLES: Record<Rarity, { border: string; text: string; shadow: string }> = {
  common: {
    border: 'border-rarity-common',
    text: 'text-rarity-common',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.55)]',
  },
  uncommon: {
    border: 'border-rarity-uncommon',
    text: 'text-rarity-uncommon',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.55)]',
  },
  rare: {
    border: 'border-rarity-rare',
    text: 'text-rarity-rare',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.55)]',
  },
  ultra_rare: {
    border: 'border-rarity-ultra',
    text: 'text-rarity-ultra',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_32px_rgba(245,165,36,0.35)]',
  },
}

const SLIDE_PX = 56

/**
 * The unlock toast. Spec: docs/DESIGN.md §6; mockup: docs/design/mockups/unlock-toast.html.
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
      // 96%-opaque surface-2: the one documented exception to "colours come from tokens".
      className={`relative flex h-24 w-[380px] items-center gap-3 overflow-hidden rounded-panel border bg-[#181c25f5] p-4 ${style.border} ${style.shadow}`}
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
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 0.9, delay: 0.35, ease: 'easeInOut' }}
        />
      )}
    </motion.div>
  )
}
