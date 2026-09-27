import type { ToastPayload } from '@shared/ipc'

const SAMPLE_TOASTS: readonly ToastPayload[] = [
  {
    heading: 'Achievement unlocked',
    rarity: 'ultra_rare',
    title: 'Lord of Frenzied Flame',
    description: 'Achieve the Lord of Frenzied Flame ending',
    game: 'Elden Ring',
    platform: 'Steam',
    percent: 1.4,
    platinum: false,
  },
  {
    heading: 'Platinum unlocked',
    rarity: 'rare',
    title: 'Platinum Trophy',
    description: 'Earn all other trophies',
    game: 'God of War',
    platform: 'PlayStation',
    percent: 2.8,
    platinum: true,
  },
  {
    heading: 'Achievement unlocked',
    rarity: 'uncommon',
    title: 'Fleet Footed',
    description: 'Win a race using only the starter car',
    game: 'Forza Horizon 5',
    platform: 'Xbox',
    percent: 18.5,
    platinum: false,
  },
  {
    heading: 'Achievement unlocked',
    rarity: 'common',
    title: 'Welcome Aboard',
    description: 'Complete the tutorial',
    game: 'Hades',
    platform: 'Steam',
    percent: 42,
    platinum: false,
  },
]

let next = 0

export function nextSampleToast(): ToastPayload {
  const toast = SAMPLE_TOASTS[next % SAMPLE_TOASTS.length]!
  next += 1
  return toast
}
