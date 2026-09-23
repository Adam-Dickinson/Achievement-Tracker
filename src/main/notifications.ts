import type { ToastPayload, VisibleToast } from '@shared/ipc'
import type { UnlockEvent } from '@shared/models'
import { platformName } from '@shared/platform'
import { rarityFromPercent } from '@shared/rarity'

export const TOAST_DURATION_MS = 5000
export const MAX_VISIBLE = 3
/** More unlocks than this in one go collapse into a single toast (docs/DESIGN.md §6). */
export const BURST_SIZE = 5

export interface NotificationServiceDeps {
  readonly display: (toasts: readonly VisibleToast[]) => void
  readonly durationMs?: number
}

interface Pending {
  readonly key: string | null
  readonly toast: ToastPayload
}

interface Shown extends Pending {
  readonly id: number
  readonly timer: ReturnType<typeof setTimeout>
}

/**
 * Decides which toasts are on screen: at most MAX_VISIBLE at once, each for durationMs, the rest
 * waiting in order. The overlay only draws the list it is given.
 */
export class NotificationService {
  readonly #display: (toasts: readonly VisibleToast[]) => void
  readonly #durationMs: number
  readonly #queue: Pending[] = []
  #shown: Shown[] = []
  #nextId = 1
  #paused = false

  constructor(deps: NotificationServiceDeps) {
    this.#display = deps.display
    this.#durationMs = deps.durationMs ?? TOAST_DURATION_MS
  }

  /** While paused, unlocks are not shown (they are still recorded by the sync engine). */
  get paused(): boolean {
    return this.#paused
  }

  set paused(paused: boolean) {
    this.#paused = paused
  }

  notify(events: readonly UnlockEvent[]): void {
    if (this.#paused) return
    const fresh = events.filter((event) => !this.#has(unlockKey(event)))
    if (fresh.length === 0) return

    if (fresh.length > BURST_SIZE) {
      this.show(burstToast(fresh))
      return
    }
    for (const event of fresh) {
      this.#queue.push({ key: unlockKey(event), toast: unlockToast(event) })
    }
    this.#fill()
  }

  /** Queues a toast that isn't an unlock, such as the test notification. Shown even while paused. */
  show(toast: ToastPayload): void {
    this.#queue.push({ key: null, toast })
    this.#fill()
  }

  stop(): void {
    for (const shown of this.#shown) clearTimeout(shown.timer)
    this.#shown = []
    this.#queue.length = 0
  }

  #has(key: string): boolean {
    return [...this.#shown, ...this.#queue].some((item) => item.key === key)
  }

  #fill(): void {
    let changed = false
    while (this.#shown.length < MAX_VISIBLE) {
      const next = this.#queue.shift()
      if (!next) break
      const id = this.#nextId++
      const timer = setTimeout(() => this.#dismiss(id), this.#durationMs)
      this.#shown.push({ ...next, id, timer })
      changed = true
    }
    if (changed) this.#publish()
  }

  #dismiss(id: number): void {
    this.#shown = this.#shown.filter((shown) => shown.id !== id)
    this.#publish()
    this.#fill()
  }

  #publish(): void {
    this.#display(this.#shown.map(({ id, toast }) => ({ ...toast, id })))
  }
}

function unlockKey(event: UnlockEvent): string {
  return `${event.platform}:${event.gameTitle}:${event.achievement.externalId}`
}

export function unlockToast(event: UnlockEvent): ToastPayload {
  const percent = event.achievement.globalPercent
  return {
    heading: 'Achievement unlocked',
    rarity: percent === null ? 'common' : rarityFromPercent(percent),
    title: event.achievement.name,
    description: event.achievement.description,
    game: event.gameTitle,
    platform: platformName(event.platform),
    percent: percent === null ? null : roundPercent(percent),
  }
}

/** One toast standing in for a burst, led by its rarest unlock. */
export function burstToast(events: readonly UnlockEvent[]): ToastPayload {
  const [rarest, ...rest] = [...events].sort(
    (a, b) => (a.achievement.globalPercent ?? 101) - (b.achievement.globalPercent ?? 101),
  )
  if (!rarest) throw new Error('burstToast needs at least one event')

  const games = new Set(events.map((event) => event.gameTitle))
  const platforms = new Set(events.map((event) => event.platform))
  return {
    ...unlockToast(rarest),
    heading: `${events.length} achievements unlocked`,
    description: `and ${rest.length} more`,
    game: games.size === 1 ? rarest.gameTitle : `${games.size} games`,
    platform: platforms.size === 1 ? platformName(rarest.platform) : 'Several platforms',
  }
}

// One decimal place, or two below 1% so a very rare unlock doesn't read as 0%.
function roundPercent(percent: number): number {
  const scale = percent < 1 ? 100 : 10
  return Math.round(percent * scale) / scale
}
