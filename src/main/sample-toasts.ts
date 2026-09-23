import type { ToastPayload } from '@shared/ipc'

// Sample unlocks, one per rarity tier, used by the "Send test notification" actions.
const SAMPLE_TOASTS: readonly ToastPayload[] = [
  {
    heading: 'Achievement unlocked',
    rarity: 'ultra_rare',
    title: 'Lord of Frenzied Flame',
    description: 'Achieve the Lord of Frenzied Flame ending',
    game: 'Elden Ring',
    platform: 'Steam',
    percent: 1.4,
  },
  {
    heading: 'Achievement unlocked',
    rarity: 'rare',
    title: 'Platinum Trophy',
    description: 'Earn all other trophies',
    game: 'God of War',
    platform: 'PlayStation',
    percent: 2.8,
  },
  {
    heading: 'Achievement unlocked',
    rarity: 'uncommon',
    title: 'Fleet Footed',
    description: 'Win a race using only the starter car',
    game: 'Forza Horizon 5',
    platform: 'Xbox',
    percent: 18.5,
  },
  {
    heading: 'Achievement unlocked',
    rarity: 'common',
    title: 'Welcome Aboard',
    description: 'Complete the tutorial',
    game: 'Hades',
    platform: 'Steam',
    percent: 42,
  },
]

let next = 0

/** Returns the next sample toast, cycling through the rarity tiers. */
export function nextSampleToast(): ToastPayload {
  const toast = SAMPLE_TOASTS[next % SAMPLE_TOASTS.length]!
  next += 1
  return toast
}
